# Schedule Versions

Washington-Schedule now uses Supabase schedule versions for the live Schedule screen.

## Model

- `schedule_versions` stores one draft, review, published, or archived schedule version.
- `departments.active_schedule_version_id` points to the currently active published version.
- `schedule_entries` stores staff rows for a version.
- `shift_shortages` stores shift-level Short Shift alerts for a version.

Schedule cards do not store or show phone numbers. Phone numbers remain Staff Directory profile data only.

## Active Published Version

Authenticated department users read the active version through Supabase RLS.

If `active_schedule_version_id` is empty, the Schedule screen shows:

`No published schedule is active yet.`

Admins see a link to create a schedule version. The app does not silently fall back to demo schedule data once authenticated.

## Manual Schedule Builder

Admins can open:

`/admin/schedule-versions`

The builder supports:

- Create schedule version
- Edit version label, date range, and status
- Add/edit/delete schedule entries on draft or review versions
- Add/edit/delete Short Shift alerts on draft or review versions
- Open Import Schedule for review-first schedule creation
- Publish a version
- Archive a version

Published and archived versions are read-only from the builder.

## Schedule Entries

Manual entry fields:

- Date
- Shift type: `day_shift`, `night_shift`, `pft`, `pulmonary_rehab`, `flexible`
- Shift start
- Shift end
- Staff member from `staff_profiles`
- Entry status: `scheduled` or `available`

The UI flags obvious duplicate entries for the same staff member, date, shift type, and status.

## Batch Paste Format

Admins can paste schedule rows in this format:

```text
2026-06-23 | day_shift | 07:00 | 19:00 | Jonathan Burdick | scheduled
2026-06-23 | day_shift | 07:00 | 19:00 | Mona Ahmed | available
2026-06-23 | night_shift | 19:00 | 07:00 | Joann Devera | scheduled
```

The preview matches staff names against `staff_profiles`.

- Matched rows can be saved.
- Unmatched rows are marked `Needs Review`.
- Admins must manually select a roster match before saving unmatched rows.
- The batch tool never creates new staff profiles.

## Import Schedule

Admins can also open:

`/admin/import-schedule`

The import workflow supports uploading source images/PDF metadata, browser image compression, manual structured paste, editable review rows, roster matching, row removal for crossed-out names, optional Short Shift alerts, and schedule version creation.

Import results are review-first. They never auto-publish.

Final actions:

- Save as Draft/Review creates a schedule version and entries without making it active.
- Save and Publish creates a schedule version, entries, optional Short Shift alerts, publishes it, and sets it as active.

## Short Shift Rules

Short Shift is shift-level only.

- `severity = short` renders a yellow Short Shift chip.
- `severity = urgent` renders a red Short Shift chip.
- Short Shift alerts render at the top of the relevant shift section before employee cards.
- Short Shift never appears on an employee card.

Employee-level request statuses remain:

- Switch Requested
- Coverage Requested

Those persistent request flows are planned for a later phase.

## Publishing

Publishing a version:

1. Sets `schedule_versions.status = published`.
2. Sets `published_at`.
3. Sets `published_by`.
4. Updates `departments.active_schedule_version_id`.

Previous published versions are retained. They are not deleted.

## Rollback

Rollback is currently handled by publishing a previous version again. A fuller rollback UI with clearer audit actions remains future work.

## Out Of Scope

This phase does not include:

- OCR or AI extraction
- Push notifications
- Native mobile
- Payroll integration
- EMR integration
- Patient information
- Clinical notes
- Billing
- Workday integration
