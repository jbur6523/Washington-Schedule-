# Import Schedule

Import Schedule is an admin-only, review-first workflow at:

`/admin/import-schedule`

Washington-Schedule is not the official hospital schedule. It is a staff-managed coordination view only.

## Supported Sources

Admins can upload jpg, jpeg, png, webp, and pdf files. Multiple image uploads are supported for one import. PDF files are accepted as source metadata; image preview and compression apply to image files only.

## Image Handling

Images are compressed in the browser before review:

- Max width is about 1800px.
- JPEG quality is about 0.82.
- Original size and compressed size are shown.
- Preview thumbnails are shown for images.

Raw images are not stored permanently in this phase. Uploaded files are not placed in `/public` and must not be committed to GitHub.

Admins are warned:

`Crop photos to staffing schedule only. Do not upload patient information.`

## Extraction

OCR is not implemented in this phase.

The Extract/Paste step supports Schedule Code Import and manual structured paste.

## Import Modes

The import workflow supports two modes:

- Create new schedule version
- Add to current active schedule

If the department does not have an active schedule version, the workflow defaults to creating a new version. If an active schedule version exists, the workflow defaults to adding to the current active schedule.

## Create New Schedule Version

Create new schedule version keeps the original review-first behavior:

- The reviewed rows create a new `schedule_versions` row.
- The reviewed rows create new `schedule_entries`.
- Reviewed Short Shift alerts create new `shift_shortages`.
- Save as Draft/Review does not make the version active.
- Save and Publish marks the version published and sets `departments.active_schedule_version_id`.

The import still never auto-publishes. The admin must explicitly choose Save and Publish.

## Add to Current Active Schedule

Add to current active schedule appends reviewed rows to the current `departments.active_schedule_version_id`.

This mode:

- Does not create a new schedule version.
- Does not delete existing schedule entries.
- Does not delete existing Short Shift alerts.
- Does not replace the active schedule.
- Adds only reviewed, non-skipped ENTRY rows to the active version.
- Adds only reviewed, non-skipped SHORT_SHIFT rows to the active version.

This is the intended mode when an admin imports additional days or missing rows after the current schedule version already exists.

## Duplicate Handling When Appending

When adding to the current active schedule, the preview checks existing rows before saving.

A duplicate schedule entry is:

- same schedule version
- same date
- same shift type
- same shift start
- same shift end
- same staff profile
- same entry status

Duplicate rows show as `Already exists / skipped` and are skipped by default.

If the same staff member already exists on the same date and shift with the same times but a different status, the row is marked Needs Review. For example, if an existing row says scheduled and the import says available, the app does not overwrite either value automatically.

If the same staff member already exists on the same date and shift with different times, the row is also marked Needs Review.

Duplicate Short Shift alerts are skipped when they have the same:

- schedule version
- date
- shift type
- shift start
- shift end
- severity
- message

Admins can review skipped rows before completing the import.

## Schedule Range Expansion

When adding to the current active schedule, imported dates may fall outside the current version's `starts_on` and `ends_on` range.

If that happens, the workflow shows:

`This import includes dates outside the current schedule range. Expand schedule range to include them?`

The admin must confirm before saving. If confirmed, the active schedule version range expands to include the imported dates. Past and future entries are not deleted.

## Schedule Code Import

Schedule Code Import lets an admin paste structured schedule data generated outside the app, such as by ChatGPT after reading schedule images. See `docs/schedule-code-import.md` for the full rules.

This is not app source code. It is schedule data that the website can parse into draft rows.

Format:

```text
SCHEDULE_VERSION | label | starts_on | ends_on

ENTRY | date | shift_type | shift_start | shift_end | staff_identifier | entry_status

SHORT_SHIFT | date | shift_type | shift_start | shift_end | severity | message
```

Example:

```text
SCHEDULE_VERSION | Week of June 24 | 2026-06-21 | 2026-06-27

ENTRY | 2026-06-24 | day_shift | 06:30 | 19:00 | hlaw | scheduled
ENTRY | 2026-06-24 | day_shift | 06:30 | 19:00 | robm | available
ENTRY | 2026-06-24 | night_shift | 18:30 | 07:00 | rodj | scheduled

SHORT_SHIFT | 2026-06-24 | night_shift | 18:30 | 07:00 | urgent | Night shift short one RT
```

Allowed `shift_type` values:

- `day_shift`
- `night_shift`
- `pft`
- `pulmonary_rehab`
- `flexible`

Allowed `entry_status` values:

- `scheduled`
- `available`

Allowed Short Shift `severity` values:

- `short`
- `urgent`

Validation:

- `SCHEDULE_VERSION` is required when creating a new schedule version.
- `SCHEDULE_VERSION` is optional when adding to the current active schedule.
- Dates must use `YYYY-MM-DD`.
- Times must use `HH:mm`.
- Blank lines are ignored.
- Comments after `#` are ignored.
- Parse errors show line numbers.
- Unmatched staff names are flagged as Needs Review.

Admins can paste ChatGPT-generated schedule code into the Schedule Code Import field, parse it, review every row, manually correct matches, remove crossed-out names, and then choose the correct final action for the selected import mode.

When adding to the current active schedule, the `SCHEDULE_VERSION` line can still be included as source metadata and date-range guidance. It does not create a replacement version.

Staff identifiers should be permanent usernames whenever possible. The app matches usernames first, then exact display names, normalized full names, and safe unique last-name matches.

The older simple structured paste format is still supported:

```text
2026-06-24 | day_shift | 06:30 | 19:00 | Jonathan Burdick | scheduled
2026-06-24 | day_shift | 06:30 | 19:00 | Mona Ahmed | available
2026-06-24 | night_shift | 18:30 | 07:00 | Joann Devera | scheduled
```

Every draft row is editable before approval. Import results never auto-publish.

## Review

Review rows include date, day of week, shift type, shift start, shift end, raw staff name, matched staff profile, employment type, entry status, notes, Needs Review, and validation status.

Rows can be edited, removed, marked Needs Review, or cleared from Needs Review.

If a person is crossed out on the source schedule, do not include them in the reviewed schedule rows. Remove that row before creating a schedule version.

## Roster Matching

Raw names and staff identifiers are matched against `staff_profiles`.

- Username match against `username_normalized` is preferred.
- Exact display name and exact normalized full name can match.
- Last-name-only matches are accepted only if exactly one active staff profile has that last name.
- Ambiguous or unmatched identifiers remain Needs Review.
- The import workflow never creates staff profiles silently.

Normalization lowercases names, removes punctuation, and ignores extra spaces.

## Validation

Approval is blocked if any active row has missing date, missing shift type, missing shift start or end, missing staff match, missing status, or unresolved Needs Review.

The workflow shows summary counts for total rows, matched rows, Needs Review rows, scheduled rows, and available rows.

## Schedule Version Creation

After review, the admin either creates a new schedule version or appends to the current active schedule.

For Create new schedule version:

- Save as Draft/Review creates `schedule_versions` and `schedule_entries` but does not set the version active.
- Save and Publish creates the version, creates entries, marks the version published, and sets `departments.active_schedule_version_id`.

For Add to current active schedule:

- Add to Current Schedule inserts reviewed entries and Short Shift alerts into the active version.
- Existing schedule entries and Short Shift alerts are retained.
- Duplicate rows are skipped by default.
- If needed and confirmed, the active version date range expands.

## Short Shift Alerts

Admins can add Short Shift alerts during import review:

- date
- shift type
- shift start
- shift end
- severity: short or urgent
- message up to 140 characters

Short Shift is shift-level only and never attaches to a staff member.

## Privacy

Do not import patient information, clinical notes, phone numbers, payroll data, EMR data, or Workday data. Phone numbers remain Staff Directory data only.
