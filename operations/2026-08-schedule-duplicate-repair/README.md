# August 2026 Duplicate Repair Runbook

This package is prepared only. Nothing in it has been run against production.

## Fixed safeguards

- Active version: `d1c1ab1c-d842-4f1e-b155-3dca2a21b446`
- Authoritative first import: `a08d3531-86b3-4169-b63b-22d43d341971`
- Duplicate-producing imports: `391631d5-47eb-43c4-967d-1d30127fb650`, `bf72fb0a-4732-41ce-974a-02aecfd075d7`
- Dates: August 23–26, 2026
- Canonical counts: `16/18/17/18`
- Expected duplicate groups/surplus: `67/120`

## Approved execution order

1. Pause schedule administration and announce the short maintenance window.
2. Export the four affected days from `schedule_entries`, the three complete import records and their `schedule_import_rows`, all referencing override/request/offer rows, and the active version/department rows. Store the timestamped exports outside the repository.
3. Run `01-read-only-audit.sql`. Stop unless the active version, all three imports, `67` groups, `120` surplus rows, `16/18/17/18` canonical counts, and zero dependent references match exactly.
4. Run `02-transactional-repair.sql` unchanged. It intentionally rolls back; capture and review its output as the production dry run.
5. Make a separately reviewed execution copy and change only its final `rollback;` to `commit;`. Run it once with stop-on-error enabled.
6. Run `03-post-repair-verification.sql`. Require zero duplicate groups/surplus rows, counts `16/18/17/18`, 120 audit rows, and all three import records still present.
7. Only after successful repair verification, apply the additive atomic-import migration and deploy the application in the separate rollout described below.

The deterministic canonical row is the earliest `created_at`, then lowest stable UUID. The transaction locks schedule entries, rechecks all assertions and known foreign-key consumers, writes one `audit_events` snapshot per deleted row, deletes only ranks greater than one, and re-verifies before commit.

## Recovery

If any assertion fails before commit, the transaction aborts or rolls back and no recovery is required. If post-commit verification fails:

1. Stop all schedule writes.
2. Preserve the failed verification output and current four-day export.
3. Compare the 120 `schedule_exact_duplicate_removed` audit snapshots with the pre-repair export.
4. In a new reviewed transaction, reinsert only missing rows from the pre-repair export with their original IDs/timestamps; do not synthesize values from display names.
5. Recheck foreign keys and exact counts before commit.
6. Do not delete or rewrite any import history.

The local pgTAP repair regression creates the exact `30/54/51/54` incident shape with 67 groups and 120 surplus rows, applies this rank/delete/audit algorithm, and proves `16/18/17/18` with zero duplicates.
