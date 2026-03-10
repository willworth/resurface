# Resurface

Personal capture resurfacing system — ingest ideas, links, and notes from
various sources, then surface them back at optimal intervals to prevent digital
hoarding and encourage action.

## Overview

Resurface addresses a common problem: you capture great ideas, save interesting
links, and note things to explore... then never see them again. This app:

- **Ingests** items from Todoist, CLI, and browser extension capture
- **Classifies** them into categories (links, quotes, music, tools, articles,
  ideas, references)
- **Surfaces** old/forgotten items back to you at intervals optimized to prevent
  both spam and abandonment
- **Tracks** what you've seen, snoozed, archived, or dropped

The goal: turn your capture system from a write-only graveyard into a living
garden of ideas that actually resurface when useful.

See **[VISION.md](VISION.md)** for the full roadmap and design direction.

## Tech Stack

- **Next.js 15** (App Router)
- **React 19**
- **TypeScript** (strict mode)
- **SQLite** (via `node:sqlite`, native Node.js module)
- **Todoist API** (unified v1 — migrated from deprecated v2 REST, Feb 2026)
- **Vitest** for testing

## Setup

### Prerequisites

- Node.js 24+ (uses native `node:sqlite` module)
- pnpm (monorepo workspace)
- Todoist API token (for Todoist ingestion — optional if using CLI only)

### Installation

From the monorepo root:

```bash
pnpm install
```

### Configuration

**Todoist Token:**

Option 1 (Environment variable):

```bash
export TODOIST_TOKEN="your-token-here"
```

Option 2 (Config file):

```bash
mkdir -p ~/.config/todoist
echo "your-token-here" > ~/.config/todoist/token
```

Get your token from
[Todoist App Settings](https://todoist.com/app/settings/integrations/developer).

**SQLite Database Path (optional):**

By default, the database is created at `.resurface/resurface.db` in the project
directory.

To customize:

```bash
export RESURFACE_SQLITE_PATH="/path/to/custom/resurface.db"
```

## Usage

### CLI (recommended for agents and quick capture)

The CLI is the fastest way to add items. No server needed — writes directly to
SQLite.

```bash
cd packages/apps/resurface

# Add items
node cli.mjs add "https://example.com/great-article"
node cli.mjs add "Check out Sanderson lectures" --category reference
node cli.mjs add "https://youtu.be/xyz" -c music -t "Cool song"

# View stats
node cli.mjs stats

# List items
node cli.mjs list
node cli.mjs list --status snoozed --limit 10
```

**Options for `add`:**

| Flag             | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| `--category, -c` | Override category (link/quote/music/tool/article/idea/reference) |
| `--title, -t`    | Override title (default: derived from content)                   |

**Auto-detection:** If no category is given, the CLI infers it from the URL
(YouTube/Spotify → music, GitHub → tool, Substack → article) or content (quotes,
ideas, etc.).

**For AI agents:** Any agent with terminal access can run
`node cli.mjs add "..."` to save items on behalf of the user. Source is tagged
as `cli` in the database.

### Development Server (web UI)

```bash
cd packages/apps/resurface
pnpm dev
```

App runs at **http://localhost:7790** (or http://0.0.0.0:7790 for network
access).

### Todoist Ingestion

Trigger a manual sync from Todoist Inbox (server must be running):

```bash
curl -X POST http://localhost:7790/api/ingest/todoist \
  -H "Content-Type: application/json" \
  -d '{"maxItems": 250}'
```

This fetches up to 250 tasks from Todoist Inbox, classifies captures vs action
tasks, persists captures to SQLite, and completes ingested tasks in Todoist.

### Browser Extension Ingestion

The browser extension posts page captures to:

```bash
POST http://localhost:7790/api/ingest/extension
```

Payload shape:

```json
{
  "url": "https://example.com/page",
  "title": "Page Title",
  "selectedText": "optional highlighted text",
  "content": "cleaned page content",
  "metaDescription": "optional meta description",
  "ogImage": "optional OG image URL"
}
```

Extension source files are in `apps/resurface/extension/` (load unpacked in
Chrome or as a temporary add-on in Firefox).

### Build for Production

```bash
pnpm build
pnpm start
```

### Run Tests

```bash
pnpm test          # Run all tests
pnpm typecheck     # TypeScript validation
pnpm lint          # ESLint
```

## Architecture

```
resurface/
├── cli.mjs                      # Standalone CLI (no build step, node:sqlite)
├── app/                         # Next.js App Router
│   ├── page.tsx                 # Main UI (ResurfaceClient)
│   ├── layout.tsx               # Root layout
│   └── api/                     # API routes
│       ├── ingest/              # Ingestion endpoints
│       │   ├── todoist/         # Todoist sync
│       │   └── extension/       # Browser extension capture endpoint
│       ├── enrich/              # AI enrichment (classification, summarization)
│       └── items/               # Item actions (next, archive, drop, snooze)
├── components/
│   └── resurface-client.tsx     # Main React UI component
├── lib/
│   └── server/                  # Server-side logic
│       ├── sqlite.ts            # Database setup & queries
│       ├── types.ts             # TypeScript type definitions
│       ├── todoist.ts           # Todoist API client (unified v1)
│       ├── surface.ts           # Resurfacing algorithm
│       ├── classify.ts          # Classification (categories, summaries)
│       ├── enrich.ts            # Metadata enrichment
│       ├── snooze.ts            # Snooze logic
│       └── actions.ts           # Server actions (archive, drop, etc.)
├── types/
│   └── node-sqlite.d.ts         # Type definitions for node:sqlite
├── VISION.md                    # Roadmap and design direction
├── extension/                   # Chrome/Firefox MV3 extension files
└── .resurface/
    └── resurface.db             # SQLite database (auto-created)
```

## Todoist Integration

### How It Works

1. **Ingestion**: `POST /api/ingest/todoist` fetches tasks from Todoist Inbox
2. **Deduplication**: Uses fingerprint (normalized content hash) to avoid
   duplicates
3. **Classification**: Categorizes items
   (link/quote/music/tool/article/idea/reference)
4. **Storage**: Saves to SQLite with metadata (source, timestamps, counts)
5. **Completion**: Ingested captures are marked complete in Todoist

### API Migration Note (Feb 2026)

Todoist deprecated their REST API v2 and moved to a unified API at `/api/v1/`.
Key changes in `lib/server/todoist.ts`:

- Base URL: `https://api.todoist.com/rest/v2/` →
  `https://api.todoist.com/api/v1/`
- Responses wrapped in `{ results: [...], next_cursor: string | null }`
- Field renames: `is_inbox_project` → `inbox_project`, `created_at` → `added_at`

### Supported Fields

- **Content**: Task title
- **Description**: Task description (if present)
- **Created date**: Capture timestamp
- **URL extraction**: Links detected in content/description

### Current Limitations

- Only syncs Inbox tasks (not all projects)
- One-way sync (no updates back to Todoist)
- No attachment support

## Data Model

### SQLite Schema

**Table: `resurface_items`**

| Column              | Type    | Description                                                   |
| ------------------- | ------- | ------------------------------------------------------------- |
| `id`                | TEXT    | UUID primary key                                              |
| `url`               | TEXT    | Extracted URL (if any)                                        |
| `title`             | TEXT    | Item title (required)                                         |
| `summary`           | TEXT    | AI-generated summary                                          |
| `original_text`     | TEXT    | Raw content from source                                       |
| `category`          | TEXT    | Classification (link/quote/music/tool/article/idea/reference) |
| `suggested_archive` | TEXT    | AI-suggested destination for archival                         |
| `tags_json`         | TEXT    | JSON array of tags                                            |
| `source`            | TEXT    | Source system (`todoist-inbox`, `cli`, etc.)                  |
| `source_item_id`    | TEXT    | Original item ID from source                                  |
| `captured_at`       | TEXT    | ISO timestamp when originally captured                        |
| `ingested_at`       | TEXT    | ISO timestamp when added to Resurface                         |
| `last_surfaced_at`  | TEXT    | ISO timestamp of last surfacing                               |
| `surface_count`     | INTEGER | Number of times surfaced                                      |
| `status`            | TEXT    | active/snoozed/archived/dropped                               |
| `suppress_until`    | TEXT    | ISO timestamp for snooze expiry                               |
| `archived_at`       | TEXT    | ISO timestamp when archived                                   |
| `archived_to`       | TEXT    | Archive destination                                           |
| `dropped_at`        | TEXT    | ISO timestamp when dropped                                    |
| `fingerprint`       | TEXT    | Content hash for deduplication (unique)                       |
| `snooze_count`      | INTEGER | Number of times snoozed                                       |

**Indexes:**

- Unique on `fingerprint` (deduplication)
- On `status` (filtering)
- On `source_item_id` (lookups)

## Resurfacing Algorithm

Currently implemented in `lib/server/surface.ts`:

**Priority logic:**

1. Never-surfaced items first
2. Oldest-surfaced items next
3. Category diversity (rotate categories)

**Suppression:**

- Snoozed items hidden until `suppress_until` expires
- Archived/dropped items excluded

**Future improvements** (planned):

- Spaced repetition intervals
- Category balancing
- Time-of-day preferences
- Contextual relevance scoring

## API Endpoints

| Endpoint                  | Method | Purpose                                         |
| ------------------------- | ------ | ----------------------------------------------- |
| `/api/ingest/todoist`     | POST   | Sync Todoist Inbox tasks                        |
| `/api/enrich`             | POST   | AI-enrich items (classification, summarization) |
| `/api/items/next`         | GET    | Get next item to surface                        |
| `/api/items/[id]/archive` | POST   | Archive an item                                 |
| `/api/items/[id]/drop`    | POST   | Drop (permanently hide) an item                 |
| `/api/items/[id]/snooze`  | POST   | Snooze item for specified duration              |

## Development

### Adding a New Source

1. Create ingestion endpoint: `app/api/ingest/<source>/route.ts`
2. Implement source-specific API client in `lib/server/<source>.ts`
3. Map source data to `ResurfaceItem` type
4. Use `getResurfaceDatabase()` to store items
5. Add tests in `lib/server/<source>.test.ts`

### Adding a New Category

1. Update `ResurfaceCategory` type in `lib/server/types.ts`
2. Update classification logic in `lib/server/classify.ts`
3. Update CLI classification in `cli.mjs`
4. Add UI rendering in `components/resurface-client.tsx`
5. Add CSS category colour in `app/globals.css`

### Running Against Test Data

```typescript
import { resetResurfaceDatabaseForTests } from '@/lib/server/sqlite'

beforeEach(() => {
  resetResurfaceDatabaseForTests() // Clear database for tests
})
```

## Current Status (v0.2)

**Implemented:**

- Todoist ingestion (unified v1 API)
- CLI for direct capture (`cli.mjs`)
- SQLite storage with fingerprint dedup
- Basic resurfacing algorithm
- Archive/drop/snooze actions
- Heuristic classification (7 categories)
- Dark mode UI (warm brown/cream palette)
- Keyboard shortcuts (A/L/D/O)

**Planned:**

- [ ] Spaced repetition algorithm
- [ ] Obsidian backlog import (AI-assisted batch)
- [ ] Browser extension (Chrome/Firefox)
- [ ] More sources (Linear, Slack saved items, browser bookmarks)
- [ ] AI enrichment (summarisation, better categorisation)
- [ ] Archival destinations (Obsidian, Notion, files)
- [ ] Stats/analytics page
- [ ] Search/filter UI

## Contributing

1. Work in the monorepo: `~/code/monorepo`
2. Create feature branch from `master`
3. Write tests for new functionality
4. Run `pnpm test` and `pnpm typecheck` before committing
5. Update this README if adding new features/endpoints

## License

Private — part of Will Worth's personal monorepo.

---

**Built as KAL-1071** — A tool for preventing digital hoarding by actively
resurfacing captured ideas at optimal intervals.
