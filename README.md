# BCT Notes PDF Downloader

A browser extension that adds a **Download PDF** button to note pages on
[bctnotes.com](https://bctnotes.com), so you can save notes as PDFs.

Works in **Chrome**, **Edge**, and **Firefox** (121+).

## Install

**Firefox:** Get it from
[addons.mozilla.org](https://addons.mozilla.org/en-US/firefox/addon/bct-notes-pdf-downloader/)
and click **Add to Firefox**.

**Chrome / Edge:**

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.

## Usage

Open a note on bctnotes.com, wait for it to load, then click the green
**⬇ Download PDF** button in the bottom-right corner.

## Troubleshooting

- **No PDF found:** make sure the note has finished loading, then click again.
- **Download fails / expired:** reload the note page and click again — the
  download link is only valid for a few minutes.

## Development

Load the unpacked extension for testing.

**Firefox:**

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and select the `manifest.json` in this
   folder. (Temporary add-ons unload when Firefox closes.)

**Chrome / Edge:** follow the **Load unpacked** steps under Install above.

After editing any file, reload the extension (the **Reload** button in
`about:debugging` or `chrome://extensions`) and reload the note tab.

## How it works

The site serves each PDF from Cloudflare R2 using a short-lived signed URL that
also requires a custom `x-bct-client` request header. The extension captures
both the URL and that header from the live network request, then re-fetches the
PDF from the page and saves it. For development, load it via `about:debugging`
in Firefox or **Load unpacked** in Chrome.
