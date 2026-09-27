// background.js — service worker for BCT Notes PDF Downloader.
//
// The bctnotes.com viewer loads each note's PDF from Cloudflare R2 via a
// short-lived signed URL (X-Amz-Expires means the signature dies after a few
// minutes). A fresh URL is generated on every page load, so we can't reuse a
// saved link.
//
// IMPORTANT (2026 change): the site now signs a custom request header,
// "x-bct-client", into the URL signature:
//     X-Amz-SignedHeaders=host;x-bct-client
// That means the request will ONLY be accepted by R2 if it is sent WITH that
// exact header value. A plain browser navigation or chrome.downloads request
// does not send it, so the download is rejected (that's why the old extension
// broke). We therefore capture BOTH the URL *and* the x-bct-client header the
// site sends, and later replay the fetch from the page context with that
// header so the signature validates.

// tabId -> { url, clientHeader } most recently observed in that tab.
const pdfByTab = new Map();

// chrome.storage.session is Chromium-only; Firefox falls back to local.
const lastPdfStore =
  chrome.storage && chrome.storage.session ? chrome.storage.session : chrome.storage.local;

function isPdfUrl(url) {
  return /\.pdf([?#]|$)/i.test(url);
}

// In Chrome MV3, custom request headers (like x-bct-client) are "extra
// headers" and are hidden from onBeforeSendHeaders UNLESS we ask for
// "extraHeaders". Firefox exposes them with just "requestHeaders" and does not
// support the "extraHeaders" option, so we only add it on Chromium.
const headerSpec = ["requestHeaders"];
try {
  const OBSH = chrome.webRequest.OnBeforeSendHeadersOptions;
  if (OBSH && OBSH.EXTRA_HEADERS) {
    // Present on Chromium only.
    headerSpec.push("extraHeaders");
  }
} catch (e) {
  /* ignore — Firefox path */
}

// Watch outgoing request headers so we can grab the signed custom header.
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!isPdfUrl(details.url)) return;
    let clientHeader = null;
    for (const h of details.requestHeaders || []) {
      if (h.name.toLowerCase() === "x-bct-client") {
        clientHeader = h.value;
        break;
      }
    }
    if (details.tabId >= 0) {
      const prev = pdfByTab.get(details.tabId) || {};
      pdfByTab.set(details.tabId, {
        url: details.url,
        clientHeader: clientHeader != null ? clientHeader : prev.clientHeader || null,
      });
    }
    lastPdfStore
      .set({ lastPdf: { url: details.url, clientHeader: clientHeader || null } })
      .catch(() => {});
  },
  { urls: ["*://*.r2.cloudflarestorage.com/*"] },
  // "requestHeaders" gives us header names/values; on Chromium we also need
  // "extraHeaders" (added above) to see custom headers like x-bct-client.
  // No blocking is used.
  headerSpec
);

// Also keep the plain onBeforeRequest capture as a fallback for the URL in
// case a request has no custom header (older/other flows).
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isPdfUrl(details.url)) return;
    if (details.tabId >= 0 && !pdfByTab.has(details.tabId)) {
      pdfByTab.set(details.tabId, { url: details.url, clientHeader: null });
    }
  },
  { urls: ["*://*.r2.cloudflarestorage.com/*"] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  pdfByTab.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message && message.type) {
    case "GET_PDF_INFO": {
      // Content script asks: what PDF URL + header did we capture for this tab?
      const info = (sender.tab && pdfByTab.get(sender.tab.id)) || null;
      sendResponse({ info });
      return false;
    }
    case "GET_LATEST": {
      // Popup asks: what's the most recent PDF we've seen anywhere?
      lastPdfStore.get("lastPdf").then((data) => {
        sendResponse({ info: data.lastPdf || null });
      });
      return true; // async response
    }
    default:
      return false;
  }
});
