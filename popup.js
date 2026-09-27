// popup.js — shows the latest captured PDF and lets you download it.
//
// The actual download must run inside a bctnotes.com tab (page context) so the
// fetch carries the right Origin and the signed x-bct-client header is accepted
// by R2. The popup itself has a chrome-extension:// origin and would be blocked
// by CORS, so we ask the content script in the active tab to do the download.

const statusEl = document.getElementById("status");
const downloadBtn = document.getElementById("download");
const openLink = document.getElementById("open");

let latestInfo = null;

chrome.runtime.sendMessage({ type: "GET_LATEST" }, (res) => {
  latestInfo = res && res.info;
  const url = latestInfo && latestInfo.url;
  if (!url) {
    statusEl.textContent =
      "No PDF detected yet. Open a note on bctnotes.com and let it load, then come back here.";
    return;
  }
  statusEl.textContent = "Latest captured note is ready to download.";
  downloadBtn.disabled = false;
  openLink.href = url;
  openLink.hidden = false;

  downloadBtn.addEventListener("click", onDownload);
});

function onDownload() {
  downloadBtn.disabled = true;
  statusEl.textContent = "Downloading\u2026";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    const onBctnotes = tab && tab.url && /^https:\/\/bctnotes\.com\//.test(tab.url);
    if (!tab || !onBctnotes) {
      statusEl.textContent =
        "Open a bctnotes.com note tab first, then use this download button.";
      downloadBtn.disabled = false;
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "DOWNLOAD_INFO", info: latestInfo }, (r) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent =
          "Couldn't reach the note page. Reload the bctnotes.com tab and try again.";
        downloadBtn.disabled = false;
        return;
      }
      if (r && r.ok) {
        statusEl.textContent = "Download started!";
      } else {
        statusEl.textContent =
          "Failed: " + ((r && r.error) || "unknown error") + " \u2014 try reloading the note page.";
        downloadBtn.disabled = false;
      }
    });
  });
}
