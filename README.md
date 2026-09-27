# BCT Notes PDF Downloader

A browser extension that adds a **Download PDF** button to note pages on
[bctnotes.com](https://bctnotes.com), so you can save notes as PDFs even though
the site's own download button was removed.

## Why this is needed

The note viewer loads each note's PDF from Cloudflare R2 using a **signed URL
that expires after a few minutes** (the `X-Amz-Expires` query parameter), and a
new signed URL is generated on every page load.

As of 2026 the site also **signs a custom request header** into that URL:

```
X-Amz-SignedHeaders=host;x-bct-client
```

This means the signed URL is only accepted by R2 when the request is sent
**with the exact `x-bct-client` header value** the site used. A plain browser
navigation or a `chrome.downloads` request does not send that header, so R2
rejects it (this is what broke the old version of the extension).

So the extension now:

1. **Watches the live network request** (`chrome.webRequest.onBeforeSendHeaders`)
   while the note loads, capturing both the signed URL **and** the
   `x-bct-client` header value.
2. **Replays the fetch from the page context** (the content script runs on
   `bctnotes.com`, so the `Origin`/`Referer` match and CORS passes), attaching
   the captured `x-bct-client` header.
3. Saves the returned bytes as a Blob via a temporary object URL.

## Browser support

Manifest V3 — works in **Chrome**, **Edge**, and **Firefox** (121+).

## Install (Chrome / Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Done — open a note on bctnotes.com and click the green **⬇ Download PDF**
   button in the bottom-right corner.

## Install (Firefox)

Get it from [addons.mozilla.org (AMO)](https://addons.mozilla.org/en-US/firefox/addon/bct-notes-pdf-downloader/)
and click **Add to Firefox**.

To install the unpacked version for development:

1. Open `about:debugging` in Firefox.
2. Click **This Firefox** (left sidebar).
3. Click **Load Temporary Add-on** and select the `manifest.json` file in this
   folder.
4. Done. Note: temporary add-ons unload when Firefox closes.

## How it works

- **Background service worker** (`background.js`) passively observes every
  request to `*.r2.cloudflarestorage.com`. Via `onBeforeSendHeaders` it captures
  both the newest signed PDF URL **and** the `x-bct-client` header value, per
  tab (and the newest one overall).
- **Content script** (`content.js`) shows a floating **Download PDF** button on
  note pages only (paths like `/notes/<id>/...`), and tracks client-side
  navigation so it appears/disappears as you move between pages. On click it
  asks the background worker for the captured URL + header; if none is captured
  yet (e.g. the PDF is still loading) it also scans resource-timing entries and
  the DOM as a fallback, retrying for a few seconds. It then **fetches the PDF
  from the page context with the `x-bct-client` header attached** and saves the
  bytes as a Blob via a temporary object URL.
- **Popup** (`popup.html`) shows the most recently captured PDF; on download it
  asks the active bctnotes.com tab's content script to perform the fetch (so the
  request keeps the correct origin and signed header).

## Troubleshooting

- **"No PDF link found"** — make sure a note is actually open and has finished
  loading, then click again. The button retries automatically for a few seconds.
- **Download fails / expired** — the signed URL is only valid for ~15 minutes.
  Reload the note page (this generates a fresh URL) and click the button again.
- **Notes hosted elsewhere in the future** — if the site stops serving PDFs from
  `r2.cloudflarestorage.com`, update the host pattern in `manifest.json` and
  `background.js`.
