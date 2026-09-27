// content.js — adds a floating "Download PDF" button to bctnotes.com pages.
//
// 2026 change: the R2 signed URL now signs a custom "x-bct-client" header
// (X-Amz-SignedHeaders=host;x-bct-client). So the URL alone is useless — the
// request must carry that exact header value or R2 returns 403. We can't do
// that through chrome.downloads, but we CAN do it here: this content script
// runs in the bctnotes.com page context, so a fetch() we issue has the correct
// Origin/Referer AND we can attach the captured x-bct-client header. We fetch
// the bytes, turn them into a Blob, and save via a temporary object URL.

(() => {
  "use strict";

  const R2_PDF_RE = /r2\.cloudflarestorage\.com\/[^?#]*\.pdf([?#]|$)/i;
  const NOTE_PATH_RE = /^\/notes\/\d+(\/|$)/;

  const isNotePage = () => NOTE_PATH_RE.test(location.pathname);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function askBackgroundForInfo() {
    return sendMessage({ type: "GET_PDF_INFO" }).then((res) => (res && res.info) || null);
  }

  // Fallback: find R2 PDF URLs the page has already fetched or embedded.
  function scanPageForPdfUrls() {
    const found = [];
    try {
      for (const entry of performance.getEntriesByType("resource")) {
        if (R2_PDF_RE.test(entry.name) && !found.includes(entry.name)) found.push(entry.name);
      }
    } catch (e) {
      /* ignore */
    }
    document
      .querySelectorAll("iframe[src], embed[src], object[data], a[href], source[src]")
      .forEach((el) => {
        const raw = el.src || el.data || el.href || "";
        if (R2_PDF_RE.test(raw) && !found.includes(raw)) found.push(raw);
      });
    return found;
  }

  function fileNameFromUrl(url) {
    try {
      const path = new URL(url).pathname;
      const name = decodeURIComponent(path.split("/").filter(Boolean).pop() || "note.pdf");
      return name.endsWith(".pdf") ? name : name + ".pdf";
    } catch (e) {
      return "note.pdf";
    }
  }

  // Core: replay the request WITH the signed x-bct-client header, from the
  // page's own origin, then save the resulting blob.
  async function fetchAndSave(info) {
    const url = info.url;
    const headers = {};
    if (info.clientHeader) headers["x-bct-client"] = info.clientHeader;

    // credentials:"omit" — the signed URL is self-authenticating; sending
    // cookies is unnecessary and can trip CORS. Origin/Referer are set
    // automatically because we run in the page context.
    const resp = await fetch(url, {
      method: "GET",
      headers,
      credentials: "omit",
      mode: "cors",
    });
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status + " " + resp.statusText);
    }
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileNameFromUrl(url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke a bit later so the download has time to start.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  function setStatus(statusEl, text, kind) {
    statusEl.textContent = text;
    statusEl.hidden = false;
    statusEl.style.background =
      kind === "ok" ? "#16a34a" : kind === "error" ? "#dc2626" : "rgba(17,24,39,0.85)";
    clearTimeout(statusEl._timer);
    statusEl._timer = setTimeout(() => {
      statusEl.hidden = true;
    }, 6000);
  }

  function createUI() {
    const container = document.createElement("div");
    container.id = "bct-pdf-widget";
    container.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;" +
      "display:flex;flex-direction:column;align-items:flex-end;gap:6px;" +
      "font-family:system-ui,-apple-system,sans-serif;";

    const btn = document.createElement("button");
    btn.id = "bct-pdf-download-btn";
    btn.type = "button";
    btn.textContent = "\u2B07 Download PDF";
    btn.style.cssText =
      "background:#16a34a;color:#fff;border:none;border-radius:999px;" +
      "padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;" +
      "box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .15s;" +
      "font-family:inherit;";
    btn.addEventListener("mouseenter", () => (btn.style.opacity = "0.9"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = "1"));

    const status = document.createElement("div");
    status.id = "bct-pdf-status";
    status.style.cssText =
      "color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;" +
      "max-width:280px;box-shadow:0 2px 8px rgba(0,0,0,.2);";
    status.hidden = true;

    container.append(btn, status);
    document.body.appendChild(container);
    return { container, btn, status };
  }

  async function onDownloadClick(btn, status) {
    btn.disabled = true;
    btn.style.opacity = "0.6";
    setStatus(status, "Looking for the PDF link\u2026", "info");

    // Wait for the note to load and for us to have captured the request.
    let info = null;
    for (let attempt = 0; attempt < 16 && !info; attempt++) {
      info = await askBackgroundForInfo();
      // If background only saw a URL but no header yet, keep waiting a bit —
      // the header capture (onBeforeSendHeaders) is what we really need.
      if (info && !info.clientHeader && attempt < 8) {
        await sleep(400);
        info = null;
        continue;
      }
      if (!info) {
        const scanned = scanPageForPdfUrls();
        if (scanned.length) info = { url: scanned[scanned.length - 1], clientHeader: null };
      }
      if (!info) await sleep(400);
    }

    if (!info || !info.url) {
      btn.disabled = false;
      btn.style.opacity = "1";
      setStatus(
        status,
        "No PDF link found. Open a note, wait for it to render, then try again.",
        "error"
      );
      return;
    }

    setStatus(status, "Downloading\u2026", "info");
    try {
      await fetchAndSave(info);
      setStatus(status, "Download started!", "ok");
    } catch (e) {
      const msg = (e && e.message) || "unknown error";
      setStatus(
        status,
        "Download failed (" +
          msg +
          "). The link may have expired \u2014 reload the note page and click again.",
        "error"
      );
    } finally {
      btn.disabled = false;
      btn.style.opacity = "1";
    }
  }

  // ----- show/hide based on the current URL -----

  let widget = null;
  let lastShown = null;

  function updateWidget() {
    const show = isNotePage();
    if (show === lastShown) return;
    lastShown = show;

    if (!show) {
      if (widget) widget.container.style.display = "none";
      return;
    }
    if (!widget) {
      if (!document.body) return;
      widget = createUI();
      widget.btn.addEventListener("click", () => onDownloadClick(widget.btn, widget.status));
    }
    widget.container.style.display = "flex";
  }

  function watchNavigations() {
    window.addEventListener("popstate", updateWidget);
    const wrap = (fn) =>
      function (...args) {
        const result = fn.apply(this, args);
        updateWidget();
        return result;
      };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    setInterval(updateWidget, 1000);
  }

  // Let the popup trigger a download in this (page) context.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "DOWNLOAD_INFO") {
      const info = message.info;
      if (!info || !info.url) {
        sendResponse({ ok: false, error: "No captured PDF info." });
        return false;
      }
      fetchAndSave(info)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: (e && e.message) || "fetch failed" }));
      return true; // async response
    }
    return false;
  });

  function main() {
    updateWidget();
    watchNavigations();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
