# Resurface

**Stop saving things you'll never look at again.**

Resurface is a personal tool for the gap between capturing an idea and doing something with it. You save interesting links, note things to explore, bookmark articles "for later" — and then they vanish into a write-only graveyard. Pocket, Todoist inbox, browser bookmarks, notes apps: they're all the same hole.

Resurface pulls items back out, one at a time, and asks you to make a decision: archive it somewhere useful, snooze it for later, or drop it. No infinite scroll. No backlog anxiety. One item, one decision.

## How it works

1. **Capture** — throw things in from anywhere: paste a URL, type an idea, sync your Todoist inbox, use the browser extension, or pipe in structured JSON.
2. **Resurface** — the app picks an item for you using a weighted algorithm (freshness, time since last seen, category diversity, snooze history). You don't choose what to review — that's the point.
3. **Engage** — open it. Read the article. Listen to the track. Try the tool. Actually spend time with the thing you saved. Then decide: was it worth keeping? Archive it somewhere useful, or drop it. Not ready yet? Snooze it — but the clock is ticking.
4. **Force decision** — snooze something 5 times and the app disables snooze. You have to commit: keep it or let it go.

The point isn't triage. It's *engagement*. Resurface exists to make you actually look at the things you saved, not just sort them into different piles. The archive/snooze/drop flow is there to close the loop after you've engaged — not as a substitute for it.

## What it looks like

The main view shows one card at a time. Press `O` to open the link — that's the primary action. Once you've looked at it, close the loop: `A` to archive, `D` to drop, or `1-5` to snooze for later. There's a quick-capture `+` button in the header and a full items list at `/items` with sorting, search, filtering by status, and pagination.

## Ingestion sources

| Source | How |
|--------|-----|
| **Web UI** | Click `+`, paste a URL or type an idea, optionally add notes |
| **CLI** | `node cli.mjs add "https://example.com"` — no server needed, writes directly to SQLite |
| **Todoist** | `POST /api/ingest/todoist` — syncs inbox, classifies captures vs actions, completes ingested items |
| **Browser extension** | Chrome/Firefox MV3 extension captures current page with selection and metadata |
| **Structured JSON** | `POST /api/ingest/json` — batch ingest from any source |
| **Twitter bookmarks** | `POST /api/ingest/twitter-bookmarks` — import from Twitter export |
| **Obsidian vault** | `node cli.mjs obsidian` — bulk import from configured vault markdown files |

Items are auto-classified into categories (link, tool, music, article, quote, idea, reference) with suggested archive destinations. Deduplication via SHA-256 content fingerprinting.

## Tech stack

- **Next.js 15** / React 19 / TypeScript (strict)
- **SQLite** via `node:sqlite` (Node.js 24+ native module — no ORM, no external DB)
- **Vitest** for testing (36 tests)
- Single-file database at `.resurface/resurface.db`

The entire backend is pure functions calling SQLite. No Redis, no Postgres, no auth layer, no external services (except Todoist if you use that integration). Runs on a single machine.

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
| `/api/enrich` | POST | AI enrichment (classification, summarisation) |

## Project structure

```
├── app/
│   ├── page.tsx                    # Main resurface UI
│   ├── items/page.tsx              # Items list/table view
│   └── api/                        # All API routes
├── components/
│   ├── resurface-client.tsx        # Card view + quick capture
│   └── items-client.tsx            # Sortable items table
├── lib/server/
│   ├── surface.ts                  # Weighted resurfacing algorithm
│   ├── actions.ts                  # Archive, snooze, drop logic
│   ├── ingest.ts                   # Structured ingest pipeline
│   ├── classify.ts                 # Auto-classification
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

## License

MIT
