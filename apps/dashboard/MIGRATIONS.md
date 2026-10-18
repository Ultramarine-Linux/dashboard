# Database migrations

Dashboard stores its state in SQLite and applies the Drizzle migrations in
`drizzle/` on startup.

## The rule

Migrations may add tables or columns. They must not drop or rename anything
the previous release reads. A removal waits one release: first ship a release
that stops reading the table or column, then remove it in the release after.

New columns must be nullable or have a default, so the previous release can
still insert rows without knowing about them.

Before the first tagged release, tables and columns that no code reads may be
dropped in a new migration immediately, because there is no release to roll
back to. From the first release on, drops wait one release.

## Why

A server must be able to roll back to the previous release without losing
data written since the upgrade. If migrations only add, the previous release
can still run against the newer schema.

## Snapshots

Before migrating, Dashboard copies the database with SQLite's backup API to
`snapshots/dashboard.schema-<version>.<timestamp>.db` next to the database.
The schema version is the number of migrations applied. The three newest
snapshots of each version are kept.

If the database's schema version is newer than the release knows (it was
rolled back), Dashboard restores the most recent snapshot at its own schema
version and logs a warning. The newer database is kept as a snapshot, so
nothing is deleted. If no matching snapshot exists, Dashboard starts without
migrating and relies on the rule above.

## Adding a migration

1. Change `src/lib/server/db/schema.ts`.
2. Run `pnpm db:generate` and commit the generated SQL and `drizzle/meta`.
3. Never edit or delete a migration that has landed. Databases that already
   applied it would keep the old schema and quietly differ from fresh installs.
4. Migrations run with foreign key enforcement off (SQLite ignores the setting
   inside the migration transaction), so table rebuilds do not cascade
   deletes. Dashboard runs `PRAGMA foreign_key_check` afterwards and refuses to
   start if a migration left violations.
