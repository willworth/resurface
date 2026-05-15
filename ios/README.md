# Resurface iOS

Native SwiftUI client for Will's private Resurface system.

## Current v0 scope

- Connects to the Mac Mini-hosted Resurface service over Tailscale.
- Uses the stable Resurface `/api/v1` JSON endpoints.
- Shows the current resurfaced item, library search/browse, and quick capture.
- Archives, snoozes, and drops through the backend API.
- Does not own domain logic or a local database.

## Backend

Default URL:

```text
http://100.78.30.78:7790
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
