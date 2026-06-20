# Resurface iOS

Native SwiftUI client for Will's private Resurface system.

## Current v0 scope

- Connects to the Mac Mini-hosted Resurface service over Tailscale.
- Uses the stable Resurface `/api/v1` JSON endpoints.
- Shows the current resurfaced item, library search/browse, and quick capture.
- Shows a Next option for passing the current item without deciding.
- Archives, snoozes, and drops through the backend API.
- Does not own domain logic or a local database.

## Backend

Default URL:

```text
https://wills-mac-mini.taild4212d.ts.net:7790
```

The backend API is implemented in the parent repo under `app/api/v1`.

## Generate Xcode project

On the MacBook with Xcode tooling:

```bash
cd ios
xcodegen generate
open Resurface.xcodeproj
```

The Mac Mini can edit and lightly syntax-check source, but final simulator/device builds should happen on the MacBook with full Xcode installed.

## Install on Will's iPhone

On the M1 MacBook, with the iPhone connected, trusted, and unlocked:

```bash
cd ~/code/resurface
scripts/install-iphone.sh
```

Use `scripts/install-iphone.sh --no-launch` if you only want to refresh the development signature/install window and will open the app manually.
