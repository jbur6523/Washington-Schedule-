# Import Schedule

`/admin/import-schedule` is an administrator-only, three-step workflow:

1. Paste Code
2. Review
3. Upload

WHHS RT Schedule is a staff-managed coordination view, not the official hospital schedule.

## Paste Code

The page opens directly to one Schedule Code textarea. It does not accept photos, PDFs, files, OCR input, or an alternative paste format. Schedule data must never contain patient information.

The optional `SCHEDULE_VERSION` row is metadata and date-range guidance. It never creates, publishes, replaces, or activates a version. Every import targets the department's current active published version. If none exists, the administrator must use Schedule Versions first.

## Review

The authenticated server reparses the raw code, loads the current active version and Staff Directory, applies explicit corrections/exclusions, and queries only the imported date range. The browser never decides authority, matches, duplicates, or conflicts by itself.

The summary reports ENTRY and SHORT_SHIFT rows, matches, new rows, exact duplicates, unresolved rows, conflicts, unique dates, affected range, active version, and projected range. Clean rows stay collapsed under **View All Rows**. Only malformed, ambiguous/unmatched, internally duplicated, conflicting, and explicitly excluded rows are surfaced.

Matching order is username, exact display name, normalized full name, then unique last name. Ambiguous or unmatched identifiers require an existing Staff Directory profile to be selected; profiles are never created silently.

An exact entry includes version, staff, date, shift type, normalized start/end, status, and Shift Lead state. Exact existing rows are labeled **Already on schedule — will be skipped** and do not block upload. The same staff/date/shift type with differing time, scheduled/available status, or Shift Lead state is a conflict. Conflicts and internal duplicates must be corrected or explicitly excluded.

## Upload

The final action is **Add to Schedule**. The server reauthenticates and recreates the preview, requires the same active version and canonical SHA-256 digest, then calls one transaction RPC. The RPC locks and serializes the active version, rechecks every row, skips exact duplicates, blocks conflicts, inserts missing entries and Short Shifts, never shrinks the version range, writes complete row audit dispositions, and verifies counts before approval.

The server then calls an independent bounded verifier. Ordinary success appears only when database and server verification agree. Retrying identical reviewed code rechecks actual schedule state: present rows are skipped and a missing canonical row is restored without creating duplicates.

Schedule Versions remains available for emergency/manual administration, but normal import exposes no version selector or create-version action.

See `docs/schedule-code-import.md`, `docs/local-supabase.md`, and `docs/atomic-schedule-import-rollout.md`.
