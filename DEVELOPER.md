# Resurface Developer Notes

This file is for the operational and architectural details that do not belong in the public-facing README.

## Runtime model

Resurface is a single-process Next.js app with SQLite as its canonical store.

- the UI, API routes, and server-side logic all live in the same app
- the app uses `node:sqlite` directly, with no ORM
- the schema is created and lightly migrated at startup in `lib/server/sqlite.ts`

By default the database path is:

```text
$WORKTREE/.resurface/resurface.db
```

This comes from:

```ts
path.join(process.cwd(), '.resurface', 'resurface.db')
```

You can override it with:

```bash
export RESURFACE_SQLITE_PATH="/absolute/path/to/resurface.db"
```

## What happens on different machines

This is the most important operational fact:

- running Resurface on your MacBook uses the MacBook database
- running Resurface on your Mac mini uses the Mac mini database
- those are different databases unless you deliberately make them the same

So if you add an item while the app is running against a laptop-local database, that item is stored only there.

For normal day-to-day use, the recommended setup is:

1. choose one machine as canonical
2. run the app there
3. keep the SQLite file there
4. access the UI remotely if needed

For Will's current setup, that probably means:

- Mac mini = canonical instance
- laptop = development / UI iteration / experimentation

## Concurrency expectations

SQLite is a good fit for this project as long as we keep the deployment model sane.

Good fit:

- one user
- one canonical app instance
- modest traffic
- tiny to small datasets
- simple backups

Not a good fit without extra work:

- many independent app instances writing to different copies of the data
- multi-user collaboration with frequent concurrent writes
- treating copied `.db` files as if they are magically in sync

This is not a performance concern right now. It is mostly a "single source of truth" concern.

## Scaling view

For a personal or small single-user product, this architecture is strong:

- SQLite can comfortably handle far more rows than this app is likely to store soon
- preview metadata adds negligible size when storing text and URLs rather than image blobs
- backups are simple because the state lives in one file
- local CLI automation stays easy because the database is embedded

If Resurface later becomes:

- multi-user
- hosted for other people
- much more concurrent
- dependent on background workers across machines

then moving to a network database like Postgres would make sense. That would be an operational evolution, not an emergency rewrite.

## Database contents

Main tables today:

- `resurface_items`
- `resurface_events`

Important item fields:

- capture data: `url`, `title`, `original_text`, `source`
- classification data: `category`, `suggested_archive`, `tags_json`
- review state: `status`, `suppress_until`, `snooze_count`, `last_surfaced_at`
- library state: `archived_at`, `archived_to`
- preview metadata: `preview_site_name`, `preview_description`, `preview_image_url`, `preview_fetched_at`

Preview metadata is intentionally lightweight. We store text and URLs, not downloaded image blobs.

## Preview enrichment model

The library can look richer because preview metadata is stored in SQLite rather than fetched fresh on every render.

Current model:

- extension capture can persist preview metadata immediately
- server-side enrichment can fill in or refresh missing metadata
- the library renders stored metadata first

This keeps browsing fast and gives the app more archival value when the source page changes later.

## Repo hygiene note

The repo ignores `.resurface/`, which is correct for local database state.

If a real `.resurface/resurface.db` ever appears as a tracked file in git, that should be treated as an operational smell. The live database should not be a committed project artifact.

## Backup command

Use the same database-path contract for manual backups:

```bash
pnpm db:backup
```

The script reads `RESURFACE_SQLITE_PATH` when set; otherwise it uses `$WORKTREE/.resurface/resurface.db`. Backups are written beside the database under `backups/` unless `RESURFACE_BACKUP_DIR` points somewhere else.

This is a point-in-time copy for the one canonical writer model. It is not a sync mechanism between multiple live databases.

## Recommended operating pattern

For now:

- develop the code anywhere
- keep one canonical runtime database
- back up the database file occasionally
- avoid running multiple long-lived writer instances against different copies of the data

That is a solid structure for regular personal use.
