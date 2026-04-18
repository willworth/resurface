# Resurface — Vision & Roadmap

> **What this is:** A living document capturing where Resurface is headed, what
> we've learned so far, and what to build next. Updated 2026-02-16.

---

## The Problem

Everyone captures things — links, quotes, videos, ideas, book recommendations,
articles someone mentioned at dinner. The tools for capturing are excellent.
Todoist, Obsidian, browser bookmarks, "save for later" features everywhere.

The tools for _doing anything with those captures_ are terrible. Or rather, they
don't exist. The captures go into a graveyard. You never see them again. The
more you capture, the worse it gets — you're not building a library, you're
filling a landfill.

This is the problem Pocket solved (before Mozilla bought it and killed it). It's
the problem StumbleUpon solved differently (serendipitous rediscovery, but from
curated web rather than your own saves). Resurface is both: **your own curated
captures, resurfaced with the serendipity of StumbleUpon, with a library worth
keeping.**

## What Resurface Does (v0.2, Current)

- Ingests items from **Todoist Inbox** and **CLI**
- Classifies items into categories: link, quote, music, tool, article, idea,
  reference
- Surfaces one item at a time, prioritising never-seen items and rotating
  categories
- User actions: **Keep** (save to library), **Snooze** (see it later), **Drop**
  (never again)
- Keyboard shortcuts: A/L/D/O
- SQLite storage with fingerprint-based deduplication
- Dark mode UI (warm brown/cream palette)
- Runs locally at localhost:7790

## Deployment Model

**Primary instance: Mac mini (always-on).** The Mac mini runs 24/7 and has AI
agents (via OpenClaw/Canopy) that can add items on Will's behalf. This is where
the canonical SQLite database lives.

**No multi-device sync needed initially.** Rather than syncing SQLite between
machines, just run the app and CLI on the Mac mini. If you need to add something
from the MacBook, SSH or use the web UI over Tailscale.

**If sync becomes needed later:** Options are Syncthing for the SQLite file,
Litestream for SQLite replication, or migrating to a hosted DB. Don't solve this
until it's actually a problem.

## Ingestion Strategy

### Current: Todoist Inbox

The Todoist integration works well for items captured via Todoist. The ingestion
is manual (POST to `/api/ingest/todoist`) — this is intentional. It gives
control over when items flow in and prevents accidental completions.

**Key learning (2026-02-16):** Todoist deprecated their REST API v2 in early
2026 and moved to a unified API at `/api/v1/`. We've updated the client.
Response format changed: results are now paginated (`{ results, next_cursor }`),
field names shifted (`is_inbox_project` → `inbox_project`, `created_at` →
`added_at`). Watch for further API changes — this was a major breaking change
that affected many integrations (n8n, etc.).

### Current: CLI (built 2026-02-16)

`cli.mjs` — standalone Node.js script, no build step, writes directly to SQLite.
Supports `add`, `stats`, and `list` commands.

**Key design decision:** The CLI is self-contained (duplicates the classify
logic rather than importing TypeScript modules) so it works without the Next.js
server running and without a build step. This makes it trivially usable by AI
agents.

**For AI agents:** Any agent with terminal access can run:

```bash
cd packages/apps/resurface && node cli.mjs add "https://example.com" -c article
```

This is probably the most important ingestion path long-term — Will can tell any
AI agent "save this for me" and it just works.

### Next: Obsidian Backlog Import

Will has multiple Obsidian pages of saved media/links in various states of
organisation — some in markdown tables with dates, some as loose links, some as
bare text references. These represent months/years of captures that should flow
into Resurface.

**Recommended approach: AI-assisted batch import, not a parser.**

The inconsistency across files is the whole point — a rigid markdown parser
would break on every file and cost more to debug than the import is worth.
Instead:

1. Feed each Obsidian file to an AI (Claude, etc.)
2. AI extracts structured items: `{ url, title, category, date }`
3. Human eyeballs the output for sanity
4. Bulk insert via CLI — pipe through a simple loop:
   ```bash
   # AI generates lines like:
   node cli.mjs add "https://..." -c music -t "Song name"
   node cli.mjs add "https://..." -c article -t "Article title"
   # Run them as a batch script
   ```

This is a one-time backlog operation, not a recurring source. Don't over-
engineer it.

### Future: Browser Extension

A Chrome/Firefox extension for "save to Resurface" — the Pocket replacement
workflow. Click the extension icon (or keyboard shortcut) on any page, it
captures the URL + page title + optional note, sends it to Resurface.

This is medium-priority. The CLI + Todoist cover most capture scenarios. The
extension becomes valuable when Resurface is the _primary_ capture tool rather
than a secondary resurfacing layer.

**Design considerations:**

- Should work offline (queue saves, sync when Resurface is reachable)
- Minimal UI — capture should be one click, not a form
- Category auto-detection from URL/content
- Optional: highlight text on page → save as quote
- Could talk to the Next.js API (if running) or queue for later CLI insertion

**Implementation note:** The simplest v1 might not even be a proper extension. A
bookmarklet that POSTs to `/api/ingest/manual` (new endpoint) with the current
page URL and title might be enough to start. Browser extensions have review
processes and maintenance overhead; a bookmarklet is instant.

### Future: Todoist Category/Label Trigger

Rather than ingesting everything from the Todoist Inbox, add support for a
specific Todoist label (e.g., `@resurface`) or project. This way Will can tell
an AI agent "add this to Todoist with the resurface label" and it flows in on
the next sync. Lighter-weight than teaching every agent the CLI path.

### Future: More Automated Sources

- **Linear** — resurface old issues, ideas from comments
- **Slack saved items** — messages you bookmarked and forgot
- **Browser bookmarks** — the oldest graveyard of all
- **RSS/newsletter** — things you starred but never read
- **YouTube Watch Later** — the infinite queue nobody ever watches

Each source follows the same pattern: fetch → classify → fingerprint → dedup →
persist. The architecture already supports this via new
`/api/ingest/<source>/route.ts` endpoints.

## Resurfacing Algorithm

### Current

Simple but functional:

1. Never-surfaced items first (clear the backlog)
2. Then oldest-surfaced (things you haven't seen in a while)
3. Category rotation (don't show 5 links in a row)
4. Snooze respects suppress_until timestamps
5. Force decision after 5 snoozes (archive or drop)

### Planned Improvements

- **Spaced repetition intervals** — items you engage with resurface at
  increasing intervals; items you ignore fade faster
- **Time-of-day awareness** — music in the evening, articles in the morning
- **Contextual relevance** — if you're working on a music project, surface music
  captures more often
- **Batch mode** — sometimes you want to power through 20 items, not just one
- **"Feeling lucky" mode** — pure random, no algorithm. For when you want
  surprise, not optimisation
- **Decay and auto-drop** — items snoozed many times with no engagement could
  auto-archive after a threshold. Prevents the "snooze forever" loop without the
  forcing function being annoying.

## AI Enrichment

The `enrich` endpoint and classify module exist but are currently heuristic-
based. Planned:

- **AI summarisation** — for articles/links, generate a 2-sentence summary so
  you know if it's worth opening. Could fetch the URL content and summarise.
- **AI categorisation** — improve on the prefix-based heuristics. An LLM call
  per item at ingestion time would be more accurate than URL pattern matching.
- **Tag suggestion** — auto-tag items for filtering
- **Archive destination suggestion** — "this looks like it belongs in your
  Obsidian music production vault"
- **Dead link detection** — periodically check if URLs still resolve. Surface
  dead links for archival/dropping rather than letting them rot.

## UI & Design

### Current State

Minimal card-based UI. One item at a time. Keyboard-driven. Dark mode with warm
brown/cream palette.

### Design Direction

- **Review and library are different jobs** — the one-item card is still the
  focus surface for attention and decisions, but the library is allowed to be a
  real browsing and reference layer. The mistake is not having a library; the
  mistake is letting it replace review.
- **Typography-forward** — serif fonts, generous spacing. This is a reading
  tool, not a dashboard.
- **Ambient, not demanding** — Resurface should feel like leafing through a
  commonplace book, not triaging an inbox. The dark mode, the serif fonts, the
  warm colours — these are deliberate. It should invite lingering.

### Future UI

- **Stats/analytics page** — how many items ingested, archived, dropped over
  time. Capture velocity vs. resolution velocity. "You've surfaced 340 items,
  archived 220, dropped 80, 40 still circulating."
- **Filter/search** — sometimes you want to find a specific saved item, not wait
  for it to surface. This should be a strong library capability while the single
  surfaced card stays the front door.
- **Mobile-responsive** — already mostly works but could be tighter on small
  screens. Phone is a natural context for "show me something interesting."
- **Embed previews** — for YouTube links, show a thumbnail. For articles, show
  the first paragraph or OG description. Makes the decide-or-defer loop faster.

## Architecture Notes

- **SQLite via `node:sqlite`** — native Node.js module, no dependencies, fast,
  good enough for personal use. No reason to migrate to Postgres unless multi-
  device sync becomes a requirement.
- **Next.js API routes** — keeps everything in one process. The API routes are
  the "backend." Simple and correct for a personal tool.
- **CLI is self-contained** — duplicates classify logic rather than importing TS
  modules. This is intentional — avoids build steps and path alias issues, makes
  it usable by any agent without the server running.
- **No auth** — this runs locally. If it ever goes on a server, add basic auth
  or Tailscale-only access.
- **Fingerprint dedup** — SHA256 of normalised URL or text content. Works well,
  prevents the "I saved this 3 times" problem. URL normalisation strips UTM
  params, trailing slashes, and fragments.

## Open Questions

- **Library semantics**: When you "keep" an item, what metadata should make the
  library genuinely useful over time? Shelves, notes, source context, thumbnails,
  and better archive destinations are all plausible next steps. The
  `archived_to` field exists but is still lightweight.
- **Todoist bidirectional**: Should archiving in Resurface add a label or note
  back to Todoist? Probably not — keep it simple.
- **Content types beyond text**: Should Resurface handle images, PDFs, audio
  clips? Probably not in v1 — stay focused on links and text. But the schema
  could support it later.
- **Public sharing**: Could a "share this find" button generate a tiny public
  page or social post? Interesting but not urgent.

## Linear Reference

Built as **KAL-1071**. Track engineering work in Linear under the Kalisti team.

---

_Resurface exists because the capture tools won. We're drowning in saved items.
The bottleneck was never saving — it was resurfacing. This is the other half._
