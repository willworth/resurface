# Resurface Browser Extension

Manifest V3 extension for Chrome and Firefox that captures the active page into
Resurface.

## Features

- One-click capture from the toolbar popup
- Captures URL, title, selected text, page content, meta description, and OG
  image
- Sends to `POST /api/ingest/extension`
- Endpoint URL is configurable and stored in extension storage

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this directory: `~/code/resurface/extension`

## Load in Helium

Helium is Chromium-based, so it uses the same unpacked-extension flow.

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this directory: `~/code/resurface/extension`

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `~/code/resurface/extension/manifest.json`

## Default Endpoint

`https://wills-mac-mini.taild4212d.ts.net:7790/api/ingest/extension`

Update it from the popup if your Resurface server runs elsewhere.
