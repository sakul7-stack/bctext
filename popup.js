// popup.js — shows the latest captured PDF and lets you download it.

const statusEl = document.getElementById("status");
const downloadBtn = document.getElementById("download");
const openLink = document.getElementById("open");

chrome.runtime.sendMessage({ type: "GET_LATEST" }, (res) => {
  const url = res && res.url;
  if (!url) {
    statusEl.textContent = "No PDF detected yet. Open a note on bctnotes.com and let it load, then come back here.";
    return;
  }
  statusEl.textContent = "Latest captured note is ready to download.";
  downloadBtn.disabled = false;
  openLink.href = url;
  openLink.hidden = false;

  downloadBtn.addEventListener("click", () => {
    downloadBtn.disabled = true;
    statusEl.textContent = "Downloading\u2026";
    chrome.runtime.sendMessage({ type: "DOWNLOAD", url }, (r) => {
      if (r && r.ok) {
        statusEl.textContent = "Download started!";
      } else {
        statusEl.textContent = "Failed: " + ((r && r.error) || "unknown error") + " \u2014 try reloading the note page.";
        downloadBtn.disabled = false;
      }
    });
  });
});
