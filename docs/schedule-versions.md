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

Admins see a link to create a schedule version. The app does not silently fall back to placeholder schedule data once authenticated.

## Current-Day Display

The Schedule screen defaults to the current day when that date exists in the active schedule.

Current day is calculated from `departments.timezone` when available. If no department timezone is set, the app falls back to `America/Los_Angeles`.

Default selection rules:

- If today exists in the active schedule, show today.
- If today does not exist, show the next upcoming scheduled date.
- If no upcoming date exists, show the most recent schedule date.
- If the active version has no rows, show the empty schedule state.

If the app stays open across midnight, it checks the date periodically and moves the default view forward when needed.

Past days are hidden by default to keep the Schedule screen focused on today and upcoming work. Users can turn on `Show past days` to review older entries. This is display filtering only. Past schedule rows are never deleted automatically.

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

Standard department shifts display and default to military time:

- Day Shift: `06:30` to `19:00`
- Night Shift: `18:30` to `07:00`

When an admin selects `day_shift` or `night_shift`, the builder auto-fills the matching standard start/end times. Admins can still edit the times for non-standard entries.

## Batch Paste Format

Admins can paste schedule rows in this format:

```text
2026-06-23 | day_shift | 06:30 | 19:00 | Jonathan Burdick | scheduled
2026-06-23 | day_shift | 06:30 | 19:00 | Mona Ahmed | available
2026-06-23 | night_shift | 18:30 | 07:00 | Joann Devera | scheduled
```

The preview matches staff names against `staff_profiles`.

- Matched rows can be saved.
- Unmatched rows are marked `Needs Review`.
- Admins must manually select a roster match before saving unmatched rows.
- The batch tool never creates new staff profiles.

## Import Schedule

Admins can also open:

`/admin/import-schedule`

The import workflow supports uploading source images/PDF metadata, browser image compression, manual structured paste, editable review rows, roster matching, row removal for crossed-out names, optional Short Shift alerts, schedule version creation, and appending reviewed rows to the current active schedule.

Import results are review-first. They never auto-publish.

Import modes:

- Create new schedule version creates a new version and can be saved as Draft/Review or saved and published.
- Add to current active schedule inserts reviewed rows into `departments.active_schedule_version_id`.

When appending to the current active schedule:

- Existing schedule entries are not deleted.
- Existing Short Shift alerts are not deleted.
- Exact duplicate schedule rows show as `Already exists / skipped`.
- Exact duplicate Short Shift alerts are skipped.
- Conflicting rows for the same staff/date/shift are marked Needs Review.
- Imported dates outside the current version range require admin confirmation before the version range expands.

Appending is useful when adding newly received schedule days to the active schedule without replacing what is already published.

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

Adding rows to the current active schedule does not create a new version and does not republish a different version. It updates the existing active version by inserting reviewed non-duplicate rows and optional Short Shift alerts.

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
