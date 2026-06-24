# Schedule Code Import

Schedule Code Import is the preferred way to move ChatGPT-converted schedule photos into Washington-Schedule.

This is not app source code. It is structured schedule data that the website parses into draft review rows.

## Final Format

```text
SCHEDULE_VERSION | label | starts_on | ends_on

ENTRY | date | shift_type | shift_start | shift_end | staff_identifier | entry_status

SHORT_SHIFT | date | shift_type | shift_start | shift_end | severity | message
```

Example:

```text
SCHEDULE_VERSION | Week 5 Remaining Schedule | 2026-06-24 | 2026-06-25

ENTRY | 2026-06-24 | day_shift | 06:30 | 19:00 | hlaw | scheduled
ENTRY | 2026-06-24 | day_shift | 06:30 | 19:00 | robm | available
ENTRY | 2026-06-24 | night_shift | 18:30 | 07:00 | rodj | scheduled

SHORT_SHIFT | 2026-06-24 | night_shift | 18:30 | 07:00 | urgent | Night shift short one RT
```

Blank lines are ignored. Comments after `#` are ignored:

```text
ENTRY | 2026-06-24 | day_shift | 06:30 | 19:00 | robm | available # Marshall Roberts
```

## Allowed Values

`shift_type`:

- `day_shift`
- `night_shift`
- `pft`
- `pulmonary_rehab`
- `flexible`

`entry_status`:

- `scheduled`
- `available`

Short Shift `severity`:

- `short`
- `urgent`

Dates must use `YYYY-MM-DD`. Times must use `HH:mm`.

## Username-First Matching

`staff_identifier` should be a permanent username whenever possible.

Matching order:

1. Match against `staff_profiles.username_normalized`.
2. Fall back to exact display name.
3. Fall back to exact normalized full name.
4. Fall back to last name only if it matches exactly one active staff profile.
5. If no safe match is found, mark Needs Review.
6. If multiple matches are possible, mark Needs Review.

The import never creates staff profiles silently. After matching, the app stores `staff_profile_id`, not the name text.

## Preferred Name Examples

Staff Directory display names can use preferred names, but imports should use permanent usernames whenever possible.

- John Roberts / Marshall Roberts should import as `robm`.
- Yiqin Meng / Maggie should import as `yiqm`.
- Pawanjit Khera / Kinty should import as `pawk`.
- Harjot Kaur / Joy should import as `kauj`.
- Bei Yi uses `yibe` as the special short-last-name exception.

Username examples:

```text
ENTRY | 2026-06-25 | day_shift | 06:30 | 19:00 | heah | scheduled
ENTRY | 2026-06-25 | day_shift | 06:30 | 19:00 | vaya | scheduled
ENTRY | 2026-06-25 | day_shift | 06:30 | 19:00 | pawk | scheduled
ENTRY | 2026-06-25 | day_shift | 06:30 | 19:00 | yiqm | scheduled
ENTRY | 2026-06-25 | day_shift | 06:30 | 19:00 | kauj | scheduled
```

## Daily RVU Sheet Interpretation

When ChatGPT converts Daily RVU sheets:

- The sheet date at the top controls all entries on that image/page.
- Day shift images use `day_shift` and default time `06:30` to `19:00`.
- Night shift images use `night_shift` and default time `18:30` to `07:00`.
- PFT entries use `pft`.
- Pulmonary Rehab entries use `pulmonary_rehab` if included.
- Names marked `PD-Avail` should be imported as `available`.
- Names marked `PD` without `Avail` should be imported as `scheduled` unless the source clearly indicates available.
- Names that are crossed out should not be imported.
- If crossed-out status is uncertain, require manual review rather than importing confidently.
- SCN, L, PD, and similar labels can be ignored unless they affect scheduled vs available status.
- If a handwritten note clearly says someone is not working or removed, do not include that person.
- If a handwritten note is unclear, do not create a schedule row from it without review.

Do not import phone numbers, hire dates, patient information, clinical notes, or unrelated handwritten notes.

## Review Before Publish

Schedule Code Import creates draft rows. It does not auto-publish.

Admins must review rows, fix unmatched or ambiguous staff identifiers, remove crossed-out names, and then choose Save as Draft/Review or Save and Publish.
