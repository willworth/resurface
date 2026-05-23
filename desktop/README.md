# Resurface Desktop (remote shell)

Minimal native desktop shell for Resurface that loads the live Mini-hosted app.

## Scope

- Opens Resurface at the default Mini URL:
  - `https://wills-mac-mini.taild4212d.ts.net:7790/`
- No local DB
- No offline sync
- No deploy/restart behavior

This is a native wrapper around the canonical remote Resurface instance, not a
standalone local SQLite app.

## URL configuration

Priority order:

1. `RESURFACE_DESKTOP_URL` environment variable
2. `~/Library/Application Support/resurface-desktop/desktop-settings.json` with:

```json
{
  "resurfaceUrl": "https://wills-mac-mini.taild4212d.ts.net:7790/"
}
```

3. built-in default URL

Only `http://` and `https://` URLs are accepted.

## Development

From repo root:

```bash
pnpm install
pnpm desktop:check
pnpm desktop:dev
```

## Fresh Mac Build / Install

Use this when moving to another Mac. The app is a local Electron wrapper around
the Mini-hosted Resurface service; it does not copy or sync the SQLite
database.

Prerequisites:

- The Mac can reach the Mini Resurface URL on Tailscale:
  `https://wills-mac-mini.taild4212d.ts.net:7790/`
- Node and pnpm are available.
- The latest `master` has been pulled.

From repo root:

```bash
git pull
pnpm install
pnpm desktop:check
pnpm exec electron --version
curl -I --max-time 8 https://wills-mac-mini.taild4212d.ts.net:7790/
pnpm desktop:build:dir
ditto desktop/dist/mac-arm64/Resurface.app /Applications/Resurface.app
open /Applications/Resurface.app
```

Expected smoke results:

- `curl` returns `200`
- `desktop:build:dir` creates `desktop/dist/mac-arm64/Resurface.app`
- `/Applications/Resurface.app` opens to the Resurface home screen

Optional DMG build:

```bash
pnpm desktop:build:mac
```

The app is ad-hoc signed for local/personal use, not notarized for broad
distribution.
