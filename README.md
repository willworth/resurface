# Resurface

**Capture things. Revisit them. Keep what matters.**

Resurface is a personal saved-things tool built around two modes:

- **Review**: one resurfaced item at a time, so you actually open it, read it, try it, or decide it is not worth keeping.
- **Library**: a secondary browsing surface for search, reference, cleanup, and long-term storage.

The point is to avoid the write-only graveyard problem. You save links, ideas, quotes, videos, tools, and notes. Resurface brings them back into view, helps you make a decision, and gives you a library you can actually return to.

## How it works

1. **Capture** — paste a URL, type an idea, use the browser extension, sync Todoist, or ingest JSON/CLI input.
2. **Review** — the app chooses something for you using a weighted resurfacing algorithm.
3. **Engage** — open it and spend time with it.
4. **Decide** — keep it in the library, snooze it, or drop it.
5. **Force decision** — after 5 snoozes, the app disables snooze and makes you choose.

Resurface is not trying to be a giant productivity suite. It is a focused tool for saved things that need re-engagement plus a practical long-term library.

## Product shape

- **Home page**: always-available capture plus the current item in review.
- **Library**: masonry-style browsing, search, shelf filters, sorting, selection, and batch actions.
- **Preview enrichment**: stores lightweight metadata such as site name, description, and preview image URL to make the library more useful over time.

The review flow remains the center of the product, but the library is a real destination rather than a hidden admin page.

## Ingestion sources

| Source | How |
|--------|-----|
| **Web UI** | Click `+`, paste a URL or type an idea, optionally add notes |
| **CLI** | `node cli.mjs add "https://example.com"` — no server needed, writes directly to SQLite |
| **Todoist** | `POST /api/ingest/todoist` — syncs inbox, classifies captures vs actions, completes ingested items |
| **Browser extension** | Chrome/Firefox MV3 extension captures current page with selection and metadata |
| **Structured JSON** | `POST /api/ingest/json` — batch ingest from any source |
| **Twitter bookmarks** | `POST /api/ingest/twitter-bookmarks` — import from Twitter export |
| **Birdclaw bookmarks** | `pnpm ingest:birdclaw` — sync/export local Birdclaw bookmarks and import them into Resurface |
| **Obsidian vault** | `node cli.mjs obsidian` — bulk import from configured vault markdown files |

Items are auto-classified into categories (link, tool, music, article, quote, idea, reference) with suggested archive destinations. Deduplication via SHA-256 content fingerprinting.

## Tech stack

- **Next.js 15** / React 19 / TypeScript (strict)
- **SQLite** via `node:sqlite` (Node.js 24+ native module — no ORM, no external DB)
- **Vitest** for testing (36 tests)
- Single-file database at `.resurface/resurface.db`

The entire backend is pure functions calling SQLite. No Redis, no Postgres, no auth layer, no external services (except Todoist if you use that integration). Runs on a single machine.

## Storage model

Resurface is intentionally simple:

- the app server and API run in the same Next.js process
- the canonical data store is a single SQLite database file
- by default that file lives at:

```text
.resurface/resurface.db
```

That path is resolved relative to the machine and working copy you are running. If you run the app on your laptop, it uses the laptop's database file. If you run it on a Mac mini, it uses the Mac mini's database file.

You can override the location with:

```bash
export RESURFACE_SQLITE_PATH="/absolute/path/to/resurface.db"
```

That makes the deployment model explicit:

- **one machine running Resurface** = one canonical database
- **two separate machines running Resurface** = two separate databases unless you deliberately point them at the same file

If you want the Mac mini to be the source of truth, run the app there and treat local laptop runs as disposable dev instances unless you intentionally copy or point at the same database.

## Is SQLite okay here?

Yes. This is exactly the kind of application SQLite is good at.

- The data volume is tiny by database standards.
- Reads are fast.
- A single-user or low-concurrency personal app is a great fit.
- Adding a few metadata columns per item is cheap.
- Operational overhead stays near zero.

The main thing SQLite does **not** want is multiple unrelated app instances casually acting as co-equal writers to different copies of the same logical dataset. That is a deployment/operational problem, not a SQLite performance problem.

Recommended approach today:

- keep **one canonical writer** instance
- back up the `.db` file occasionally
- use local clones for UI work and development
- move to Postgres or another networked database only if the product genuinely grows into multi-user or high-concurrency needs

## Setup

```bash
# Requires Node.js 24+
pnpm install
pnpm build
pnpm start        # Production server on port 7790
# or
pnpm dev          # Dev server with hot reload
```

**Optional: Todoist integration**
```bash
# Get token from https://todoist.com/app/settings/integrations/developer
export TODOIST_TOKEN="your-token"
# or
mkdir -p ~/.config/todoist && echo "your-token" > ~/.config/todoist/token
```

**Optional: Custom database path**
```bash
export RESURFACE_SQLITE_PATH="/path/to/resurface.db"
```

For a real day-to-day setup, the best pattern is usually:

1. run Resurface on one machine you trust as canonical
2. keep the SQLite file on that machine
3. access the UI over Tailscale, local network, or a later hosted deployment

That avoids split-brain data.

## CLI

The CLI writes directly to SQLite — no server needed. Good for scripts and AI agents.

```bash
node cli.mjs add "https://example.com/article"          # Auto-classified as 'link'
node cli.mjs add "https://youtu.be/xyz" -c music        # Override category
node cli.mjs add "Look into spaced repetition" -t "SR"  # With custom title
node cli.mjs stats                                       # Item counts by status
node cli.mjs list --status snoozed --limit 10            # Filter items
node cli.mjs obsidian                                    # Import from Obsidian vault
```

## Resurfacing algorithm

Items are scored using a weighted formula (all weights configurable via environment variables):

- **Freshness** — newer items score higher
- **Resurfacing gap** — items not seen for a long time score higher
- **Diversity boost** — avoids showing the same category repeatedly
- **Snooze penalty** — frequently-snoozed items score lower
- **Intent boost** — tagged items (urgent, research, buy) score higher

Never-surfaced items are prioritised. After 5 snoozes, the "Later" option is disabled and you must archive or drop.

Telemetry: all actions (ingest, surface, archive, snooze, drop) are logged to a `resurface_events` table for future analytics.

## API

Resurface exposes two API surfaces:

- the original web-app routes under `/api/*`
- a stable native-client contract under `/api/v1/*`, intended for clients such as an iOS app

`/api/v1/*` responses use a simple JSON envelope:

```json
{ "data": {} }
```

Errors return:

```json
{ "error": "Message" }
```

### Stable v1 API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/health` | GET | Health check plus item counts |
| `/api/v1/items` | GET | List items with pagination, sorting, search, and status filter |
| `/api/v1/items` | POST | Batch capture/ingest structured items |
| `/api/v1/items/next` | GET | Next item to surface (weighted) |
| `/api/v1/items/session` | GET | Batch of ranked items for a session |
| `/api/v1/items/[id]/archive` | POST | Archive with optional destination |
| `/api/v1/items/[id]/snooze` | POST | Snooze with preset (tomorrow, this-weekend, next-week, in-a-month, surprise) |
| `/api/v1/items/[id]/drop` | POST | Drop permanently |

### Legacy/web API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/items/next` | GET | Next item to surface (weighted) |
| `/api/items/list` | GET | All items with pagination, sorting, search, status filter |
| `/api/items/session` | GET | Batch of ranked items for a session |
| `/api/items/[id]/archive` | POST | Archive with optional destination |
| `/api/items/[id]/snooze` | POST | Snooze with preset (tomorrow, this-weekend, next-week, in-a-month, surprise) |
| `/api/items/[id]/drop` | POST | Drop permanently |
| `/api/ingest/json` | POST | Batch ingest structured items |
| `/api/ingest/todoist` | POST | Sync Todoist inbox |
| `/api/ingest/extension` | POST | Browser extension capture |
| `/api/ingest/twitter-bookmarks` | POST | Twitter bookmarks import |
| `/api/enrich` | POST | Preview and metadata enrichment |

## Project structure

```
├── app/
│   ├── page.tsx                    # Review-first home page
│   ├── library/page.tsx            # Library surface
│   ├── items/page.tsx              # Redirect to /library
│   └── api/                        # All API routes
├── components/
│   ├── resurface-client.tsx        # Review UI + inline capture
│   └── items-client.tsx            # Library masonry UI
├── lib/server/
│   ├── surface.ts                  # Weighted resurfacing algorithm
│   ├── actions.ts                  # Archive, snooze, drop logic
│   ├── ingest.ts                   # Structured ingest pipeline
│   ├── classify.ts                 # Auto-classification
│   ├── preview.ts                  # Preview metadata fetching
│   ├── events.ts                   # Telemetry logging
│   ├── snooze.ts                   # Snooze presets and calculations
│   ├── sqlite.ts                   # Database setup
│   └── types.ts                    # TypeScript types
├── cli.mjs                         # Standalone CLI (no build step)
├── scripts/
│   ├── ingest-structured.mjs       # Batch JSON ingest script
│   └── ingest-twitter-bookmarks.mjs
├── extension/                      # Chrome/Firefox MV3 browser extension
└── .resurface/resurface.db         # SQLite database (auto-created)
```

## Development

```bash
pnpm test          # 36 tests
pnpm typecheck     # TypeScript strict mode
pnpm lint          # ESLint
```

For architecture and deployment notes, see [DEVELOPER.md](./DEVELOPER.md).

## License

MIT
