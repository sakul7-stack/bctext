// background.js — service worker for BCT Notes PDF Downloader.
//
// The bctnotes.com viewer loads each note's PDF from Cloudflare R2 via a
// short-lived signed URL (the X-Amz-Expires=900 query param means it dies
// after ~15 minutes). That URL is generated fresh on every page load, so we
// can't reuse a saved link. Instead we watch the actual network requests with
// chrome.webRequest (passive observation, no blocking) and remember the most
// recent PDF URL per tab. The content-script button and the popup then ask us
// to download that URL before its signature expires.

// tabId -> most recent R2 PDF URL observed in that tab
const pdfByTab = new Map();

// chrome.storage.session is Chromium-only; Firefox falls back to local.
const lastPdfStore =
  chrome.storage && chrome.storage.session ? chrome.storage.session : chrome.storage.local;

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Only the note PDFs are served from R2; ignore anything else (e.g. if the
    // site ever serves images/fonts from there, we must not download those).
    if (!/\.pdf([?#]|$)/i.test(details.url)) return;
    if (details.tabId >= 0) {
      pdfByTab.set(details.tabId, details.url);
    }
    // Keep the newest one available to the popup as well.
    lastPdfStore.set({ lastPdfUrl: details.url }).catch(() => {});
  },
  { urls: ["*://*.r2.cloudflarestorage.com/*"] }
);

// Tidy up when a tab closes so the map doesn't grow forever.
chrome.tabs.onRemoved.addListener((tabId) => {
  pdfByTab.delete(tabId);
});

// Turn ".../v3/first/CT%20101/Programming_in_C.pdf?X-Amz-..." into
// "Programming_in_C.pdf" so the saved file has a sensible name.
function fileNameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const name = decodeURIComponent(path.split("/").filter(Boolean).pop() || "note.pdf");
    return name.endsWith(".pdf") ? name : name + ".pdf";
  } catch (e) {
    return "note.pdf";
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message && message.type) {
    case "GET_PDF_URL": {
      // Content script asks: what PDF URL did we capture for this tab?
      const url = sender.tab && pdfByTab.get(sender.tab.id);
      sendResponse({ url: url || null });
      return false;
    }
    case "GET_LATEST": {
      // Popup asks: what's the most recent PDF URL we've seen anywhere?
      lastPdfStore.get("lastPdfUrl").then((data) => {
        sendResponse({ url: data.lastPdfUrl || null });
      });
      return true; // async response
    }
    case "DOWNLOAD": {
      const url = message.url || (sender.tab && pdfByTab.get(sender.tab.id));
      if (!url) {
        sendResponse({ ok: false, error: "No PDF URL captured yet. Open a note on bctnotes.com first." });
        return false;
      }
      chrome.downloads.download(
        { url, filename: fileNameFromUrl(url), saveAs: false },
        (downloadId) => {
          const err = chrome.runtime.lastError;
          if (err) sendResponse({ ok: false, error: err.message });
          else sendResponse({ ok: true, downloadId });
        }
      );
      return true; // async response
    }
    default:
      return false;
  }
});
