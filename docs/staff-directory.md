# Staff Directory

Phase 3 moves the Staff tab from mock roster data to Supabase `staff_profiles`.

## Data Source

- Staff Directory reads from `public.staff_profiles`.
- Access is protected by Supabase Auth and Row Level Security.
- The Schedule, Manage Schedule, and Coverage Board tabs read schedule coordination data from Supabase in later phases.
- If no `staff_profiles` rows exist for the user department, the app shows: `No staff profiles have been added yet.`

## Phone Number Rules

- Phone numbers belong only to `staff_profiles.phone_number`.
- Phone numbers are shown only inside Staff Directory/profile areas.
- Phone numbers must not be shown on Schedule cards or Coverage Board cards by default.
- Phone numbers must not be stored in `schedule_entries`, `shift_requests`, `coverage_offers`, `shift_request_offers`, Coverage Board posts, import rows, audit summaries, or public examples.
- Use fake/demo phone numbers only for testing or seed data.
- Do not add patient phone numbers, emergency contacts, hire dates, payroll data, clinical notes, or EMR data.

## Permissions

- Authenticated department members can view Staff Directory records allowed by RLS.
- Admin users can create and edit staff profiles.
- Admin users can assign `lead` or `staff` roles. Only username `burj` is admin.
- Admin users can reset/unclaim staff accounts without deleting the staff profile.
- Admin users mark staff inactive instead of deleting records.
- Staff users can view the directory but cannot edit other staff profiles.
- Staff self-edit is future functionality and is not implemented in Phase 3.

## Username and Role Rules

- Usernames are assigned by the department, not chosen by users.
- Username format is first 3 letters of last name plus first letter of first name.
- Normalize by lowercasing and removing spaces, hyphens, apostrophes, and punctuation.
- Append a number for duplicates, such as `burj2`.
- `Bei Yi` is always `yibe`.
- `burj` is reserved for Jonathan Burdick and is the only admin username.
- Lead defaults are Allan Timbang, Jonathan Burdick, Heather Heath, Tom Nguyen, Win Hlaing, Bei Yi, Katryna Vuong, Joann Devera, Victor Davis, Jean Rodrillo, Gene Benoza, and Stephanie Ortiz.
- Usernames are permanent after account claim. Admins can regenerate usernames only while a profile is unclaimed.

## Batch Roster Provisioning

Admins can paste roster lines in this format:

```text
Allan Timbang | full_time | day_shift
Joann Devera | full_time | night_shift
Mona Ahmed | per_diem | day_shift
```

The preview shows display name, employment type, home assignment, generated username, assigned role, and validation status. Rows marked `Needs Review` are not created until the admin fixes the pasted input and previews again.

Possible duplicates are flagged when the display name already exists or appears twice in the pasted batch. The app does not silently create duplicates.

## Claimed and Unclaimed Accounts

- Unclaimed staff profiles can be claimed from the username-first login screen.
- Claimed staff profiles show claimed status and claimed date when available.
- Admin reset/unclaim clears the auth/profile link so the staff member can create a new password again.
- Resetting an account does not delete the staff profile and does not delete historical schedule/request records.

## UI Behavior

- The bottom navigation still uses the existing Staff tab.
- The visible page heading is `Staff Directory`.
- Admin create/edit includes display name, employment type, home assignment, phone number, email, preferred contact method, and active status.
- Admin create/edit shows the assigned username and role.
- Phone numbers render as tap-to-call links.
- Email addresses render as tap-to-email links.
- Filters include All, Admin, Lead, Staff, Claimed, Unclaimed, Full-time, Per diem, Day Shift, Night Shift, PFT, Pulmonary Rehab, Flexible, Active, and Inactive.

## Out of Scope

- Moving schedule data to Supabase.
- Staff self-edit.
- Deleting staff profiles.
- Importing staff directory records from images or files.
- OCR, push notifications, native mobile, billing, payroll, EMR, or patient information.
