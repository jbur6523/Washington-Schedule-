# Schedule Code Import

Schedule Code is structured staffing data, not application source code.

```text
SCHEDULE_VERSION | label | starts_on | ends_on

ENTRY | date | shift_type | shift_start | shift_end | staff_identifier | entry_status
ENTRY | date | shift_type | shift_start | shift_end | staff_identifier | entry_status | lead

SHORT_SHIFT | date | shift_type | shift_start | shift_end | severity | message
```

Example:

```text
SCHEDULE_VERSION | Week 2 Daily RVU Sheets | 2026-08-23 | 2026-08-26
ENTRY | 2026-08-23 | day_shift | 06:30 | 19:00 | hlaw | scheduled | lead
ENTRY | 2026-08-23 | day_shift | 06:30 | 19:00 | robm | available
SHORT_SHIFT | 2026-08-24 | night_shift | 18:30 | 07:00 | urgent | Night shift short one RT
```

`SCHEDULE_VERSION` is optional metadata/date guidance and never creates a schedule version. Dates use `YYYY-MM-DD`. Times accept normalized 24-hour values and are stored consistently. Blank lines and comments after `#` are ignored. Errors identify the source line.

Allowed `shift_type` values are `day_shift`, `night_shift`, `pft`, `pulmonary_rehab`, `rt_aide`, and `flexible`. ENTRY status is `scheduled` or `available`. SHORT_SHIFT severity is `short` or `urgent`, with a message up to 140 characters.

The optional final lead field accepts `lead`, `shift_lead`, or `true`. Inline `(L)`, `(lead)`, `Lead`, `Shift Lead`, and trailing `-L` markers are removed before staff matching and set `is_shift_lead`. This is display metadata, not an application permission role.

Prefer permanent usernames. Matching falls back to exact display name, normalized full name, then last name only when exactly one active Staff Directory profile has that last name. Ambiguous or missing matches require administrator review. Never silently create a profile.

Rows crossed out in the source should be omitted. If their status or a lead marker is unclear, surface the row for review rather than guessing. Never include patient information, clinical notes, phone numbers, payroll data, EMR data, or unrelated notes.

The importer appends to the active published schedule. Exact duplicates are skipped, conflicts require correction/exclusion, and imports are safe to retry. Dates outside the active version range extend it automatically; existing history is never deleted or hidden to avoid a row cap.
