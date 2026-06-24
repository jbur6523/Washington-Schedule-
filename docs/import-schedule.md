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

The Extract/Paste step supports manual structured paste:

```text
2026-06-24 | day_shift | 07:00 | 19:00 | Jonathan Burdick | scheduled
2026-06-24 | day_shift | 07:00 | 19:00 | Mona Ahmed | available
2026-06-24 | night_shift | 19:00 | 07:00 | Joann Devera | scheduled
```

Every draft row is editable before approval. Import results never auto-publish.

## Review

Review rows include date, day of week, shift type, shift start, shift end, raw staff name, matched staff profile, employment type, entry status, notes, Needs Review, and validation status.

Rows can be edited, removed, marked Needs Review, or cleared from Needs Review.

If a person is crossed out on the source schedule, do not include them in the reviewed schedule rows. Remove that row before creating a schedule version.

## Roster Matching

Raw names are matched against `staff_profiles`.

- Exact normalized match is marked matched.
- Close match is suggested and remains Needs Review.
- No match remains Needs Review.
- The import workflow never creates staff profiles silently.

Normalization lowercases names, removes punctuation, and ignores extra spaces.

## Validation

Approval is blocked if any active row has missing date, missing shift type, missing shift start or end, missing staff match, missing status, or unresolved Needs Review.

The workflow shows summary counts for total rows, matched rows, Needs Review rows, scheduled rows, and available rows.

## Schedule Version Creation

After review, the admin enters label, starts_on, ends_on, and draft or review status.

- Save as Draft/Review creates `schedule_versions` and `schedule_entries` but does not set the version active.
- Save and Publish creates the version, creates entries, marks the version published, and sets `departments.active_schedule_version_id`.

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
