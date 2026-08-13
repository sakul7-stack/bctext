# BCT Notes PDF Downloader

A browser extension that adds a **Download PDF** button to note pages on
[bctnotes.com](https://bctnotes.com), so you can save notes as PDFs even though
the site's own download button was removed.

## Why this is needed

The note viewer loads each note's PDF from Cloudflare R2 using a **signed URL
that expires after ~15 minutes** (the `X-Amz-Expires=900` query parameter), and a
new signed URL is generated on every page load. So the extension can't just
remember a link — it **watches the actual network request** while the note loads
(`chrome.webRequest`), captures the live signed URL, and uses it to trigger the
download before it expires.

## Install (Chrome / Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Done — open a note on bctnotes.com and click the green **⬇ Download PDF**
   button in the bottom-right corner.

## How it works

- **Background service worker** (`background.js`) passively observes every
  request to `*.r2.cloudflarestorage.com` and remembers the newest PDF URL per
  tab (and the newest one overall).
- **Content script** (`content.js`) shows a floating **Download PDF** button on
  note pages only (paths like `/notes/<id>/...`), and tracks client-side
  navigation so it appears/disappears as you move between pages. On click it
  asks the background worker for the captured URL; if none is captured yet
  (e.g. the PDF is still loading) it also scans resource-timing entries and the
  DOM as a fallback, retrying for a few seconds. The URL is then downloaded via
  `chrome.downloads`.
- **Popup** (`popup.html`) shows the most recently captured PDF and lets you
  download it without visiting the note page again.

## Troubleshooting

- **"No PDF link found"** — make sure a note is actually open and has finished
  loading, then click again. The button retries automatically for a few seconds.
- **Download fails / expired** — the signed URL is only valid for ~15 minutes.
  Reload the note page (this generates a fresh URL) and click the button again.
- **Notes hosted elsewhere in the future** — if the site stops serving PDFs from
  `r2.cloudflarestorage.com`, update the host pattern in `manifest.json` and
  `background.js`.

## Notes

- Manifest V3, targets Chrome/Edge. Firefox would need a small tweak
  (`browser_specific_settings` in `manifest.json`).
- No icons included yet; Chrome shows its default icon. Drop a `icons/` folder
  and reference it in `manifest.json` if you want custom branding.
