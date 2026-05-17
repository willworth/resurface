# Resurface iOS handoff

Generated on 2026-05-15 from the Mac Mini.

## Repo decision

The iOS client currently lives inside the standalone Resurface repo under `ios/`.

That is intentional: the app is a thin native client over the backend `/api/v1` contract in the same repository. Keeping them together avoids API/client drift while Resurface is still a private personal tool. Split into a separate repo later only if the iOS app becomes public/productized or needs independent release management.

## What exists

- SwiftUI app scaffold generated with XcodeGen.
- API client for `/api/v1`.
- Models matching the v1 API envelopes.
- Shared view model patterned after `ledger-ios`.
- Tabs:
  - Review: current surfaced item, open/keep/snooze/drop, quick capture.
  - Library: status filter, search, item list, detail/action sheet.
  - Capture: save URL/text captures.
- Settings sheet for backend URL.
- No local source-of-truth database; only backend URL and capture draft are stored locally.

Default backend URL:

```text
https://wills-mac-mini.taild4212d.ts.net:7790
```

## Validation already run on Mac Mini

```bash
cd ~/code/resurface
xcodegen generate --spec ios/project.yml # equivalent run from ios/ succeeded
swiftc -parse ios/Resurface/*.swift
swiftc -typecheck ios/Resurface/*.swift
pnpm test       # 40/40
pnpm typecheck
pnpm lint       # passes; only existing <img> warnings in components/items-client.tsx
```

`xcodebuild` is not available here because the Mac Mini has Command Line Tools, not full Xcode/iOS SDK.

## MacBook first run

On the MacBook:

```bash
cd ~/code/resurface/ios
xcodegen generate
open Resurface.xcodeproj
```

Then:

1. Select an iPhone simulator/device.
2. Build once.
3. Confirm the backend URL in Settings points at the Mac Mini Tailscale HTTPS address and port `7790`.
4. Run Resurface backend on the Mini:

```bash
cd ~/code/resurface
pnpm start
# or pnpm dev while iterating
```

5. Test: health banner, next item, capture, archive, snooze, drop, library search.

## Feature parity audit

Good v0 parity with the web app:

- Review-first flow: yes.
- Quick capture: yes.
- Open saved URL: yes.
- Keep/archive: yes.
- Snooze presets: yes.
- Drop: yes.
- Library list/search/status filter: yes.
- Backend data ownership on Mac Mini: yes.

Not yet parity / intentionally deferred:

- Masonry visual library layout.
- Preview images/thumbnails in native UI.
- Batch library actions.
- Sorting controls beyond newest-first.
- Pagination/infinite loading past the first page.
- Server auth/token guard; currently assumes Tailscale/private network.
- Share extension for saving from iOS Safari/other apps.
- Offline queueing.

## Recommended next implementation after first successful Xcode build

1. Fix any Xcode/iOS SDK compile issues found on MacBook.
2. Add image thumbnails using `AsyncImage` for `previewImageUrl`.
3. Add a Share Extension for capture from Safari/iOS share sheet.
4. Add a simple bearer token if Resurface is exposed beyond trusted Tailscale-only access.
