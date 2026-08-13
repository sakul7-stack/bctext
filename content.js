// content.js — adds a floating "Download PDF" button to bctnotes.com pages.
//
// The button only appears on note pages (path like /notes/<id>/...), and it
// tracks client-side navigation so it shows/hides as you move between pages
// without a full reload. The notes are served from Cloudflare R2 via
// short-lived signed URLs, so the button can't use a saved link. When clicked,
// it asks the background service worker for the live URL captured (via
// chrome.webRequest) while the note was loading, falling back to scanning
// resource-timing entries and the DOM for the R2 URL. That URL is then handed
// to the downloads API.

(() => {
  "use strict";

  const R2_RE = /r2\.cloudflarestorage\.com/i;
  // Note pages look like: /notes/1/cmqi9k8s60031o20nuvyf38g1/viewer
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

  function askBackgroundForUrl() {
    return sendMessage({ type: "GET_PDF_URL" }).then((res) => (res && res.url) || null);
  }

  function downloadPdf(url) {
    return sendMessage({ type: "DOWNLOAD", url });
  }

  // Fallback: find R2 URLs the page has already fetched or embedded.
  function scanPageForPdfUrls() {
    const found = [];
    try {
      for (const entry of performance.getEntriesByType("resource")) {
        if (R2_RE.test(entry.name) && !found.includes(entry.name)) found.push(entry.name);
      }
    } catch (e) {
      /* resource timing may be unavailable; ignore */
    }
    document
      .querySelectorAll("iframe[src], embed[src], object[data], a[href], source[src]")
      .forEach((el) => {
        const raw = el.src || el.data || el.href || "";
        if (R2_RE.test(raw) && !found.includes(raw)) found.push(raw);
      });
    return found;
  }

  function setStatus(statusEl, text, kind) {
    statusEl.textContent = text;
    statusEl.hidden = false;
    statusEl.style.background =
      kind === "ok" ? "#16a34a" : kind === "error" ? "#dc2626" : "rgba(17,24,39,0.85)";
    clearTimeout(statusEl._timer);
    statusEl._timer = setTimeout(() => {
      statusEl.hidden = true;
    }, 4000);
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

    // Give the note a moment to load; retry until the PDF request is seen.
    let url = null;
    for (let attempt = 0; attempt < 12 && !url; attempt++) {
      url = await askBackgroundForUrl();
      if (!url) {
        const scanned = scanPageForPdfUrls();
        url = scanned.length ? scanned[scanned.length - 1] : null;
      }
      if (!url) await sleep(500);
    }

    if (!url) {
      btn.disabled = false;
      btn.style.opacity = "1";
      setStatus(status, "No PDF link found. Open a note on bctnotes.com, wait for it to load, then try again.", "error");
      return;
    }

    const res = await downloadPdf(url);
    btn.disabled = false;
    btn.style.opacity = "1";
    if (res && res.ok) {
      setStatus(status, "Download started!", "ok");
    } else {
      const msg = (res && res.error) || "unknown error";
      setStatus(status, "Download failed (" + msg + "). The link may have expired \u2014 reload the note page and click again.", "error");
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

  // Re-evaluate on client-side navigation (SPA routing uses pushState).
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
    // Fallback for routers that navigate some other way.
    setInterval(updateWidget, 1000);
  }

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
