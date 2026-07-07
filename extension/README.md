# Resurface Browser Extension

Manifest V3 extension for Chrome and Firefox that captures the active page into
Resurface.

## Features

- One-click capture from the toolbar popup
- Captures URL, title, selected text, page content, meta description, and OG
  image
- Sends to `POST /api/ingest/extension`
- Ingest endpoint is configurable and stored in extension storage
- Popup shows the current page URL separately from the ingest endpoint

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this directory: `apps/resurface/extension`

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `apps/resurface/extension/manifest.json`

## Default Endpoint

`http://localhost:7790/api/ingest/extension`

Update it from the popup if your Resurface server runs elsewhere.
If you paste a server root such as `https://example.com:7790`, the extension
will append `/api/ingest/extension`. Other paths are rejected so a page URL
cannot be accidentally saved as the endpoint.
