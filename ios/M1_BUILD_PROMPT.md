# Handover prompt — Resurface iOS build on M1 Mac

Use this prompt with the agent/session running on Will's M1 Mac, where full Xcode and the iOS simulator are available.

```text
You are working on Will's M1 Mac, the machine with full Xcode/iOS simulator tooling. The main agent work usually happens on the Mac Mini, but this iOS build/runtime validation must happen here.

Task: build and runtime-check the initial Resurface iOS client.

Context:
- Repo: ~/code/resurface
- iOS app lives inside the standalone Resurface repo under ~/code/resurface/ios
- Backend/API work was prepared on the Mac Mini and pushed to GitHub.
- Resurface backend is a Next.js app with SQLite on the Mac Mini as the source of truth.
- iOS client is intentionally a thin SwiftUI client over /api/v1. It must not create or own a local source-of-truth database.
- Default backend URL in the iOS app is https://wills-mac-mini.taild4212d.ts.net:7790, intended to reach the Mac Mini over Tailscale Serve. Verify/update this if the Mini's tailnet URL differs.

Before changing code:
1. cd ~/code/resurface
2. git pull --ff-only
3. Read ios/HANDOFF.md and ios/README.md
4. Inspect git status; do not overwrite local uncommitted work without asking.

Build steps:
1. cd ios
2. xcodegen generate
3. open Resurface.xcodeproj, or use xcodebuild if available and sane.
4. Build for an iPhone simulator.
5. Run the simulator app.

Backend setup:
- Ensure the Mac Mini is running Resurface on port 7790:
  cd ~/code/resurface && pnpm start
  or pnpm dev while iterating.
- Confirm the iOS app Settings backend URL points to the Mini Tailscale URL/IP + :7790.

Runtime checks:
- Health/connection banner shows connected.
- Review tab loads a current resurfaced item or empty state.
- Open URL works for an item with a URL.
- Keep/archive works and updates backend state.
- Snooze works for non-force-decision items.
- Drop works.
- Quick capture saves a URL/text item.
- Library tab loads active items, status filter works, search works.
- Item detail action sheet opens and actions work.

Known limitations/deferred work:
- No masonry layout in native UI.
- No preview thumbnails yet.
- No batch actions yet.
- No sorting controls/pagination beyond first page yet.
- No iOS Share Extension yet.
- No bearer-token auth yet; current assumption is trusted Tailscale/private network.
- No offline queueing.

Validation already done on Mac Mini:
- xcodegen generate succeeded.
- swiftc -parse ios/Resurface/*.swift passed.
- swiftc -typecheck ios/Resurface/*.swift passed.
- pnpm test passed: 40/40.
- pnpm typecheck passed.
- pnpm lint passed with only two existing <img> warnings in components/items-client.tsx.

Your deliverable:
- Fix any Xcode/iOS SDK compile or runtime issues.
- Run the simulator checks above.
- Commit any required fixes on a branch or directly only if Will explicitly wants direct master commits.
- Report exact build result, simulator/device used, backend URL used, what passed/failed, and any next blockers.
```
