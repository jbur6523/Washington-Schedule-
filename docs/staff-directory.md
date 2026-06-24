# Staff Directory

Phase 3 moves the Staff tab from mock roster data to Supabase `staff_profiles`.

## Data Source

- Staff Directory reads from `public.staff_profiles`.
- Access is protected by Supabase Auth and Row Level Security.
- The Schedule, Manage Schedule, and Shift Board tabs still use demo schedule data until later phases.
- If no `staff_profiles` rows exist for the user department, the app shows: `No staff profiles have been added yet.`

## Phone Number Rules

- Phone numbers belong only to `staff_profiles.phone_number`.
- Phone numbers are shown only inside Staff Directory/profile areas.
- Phone numbers must not be shown on Schedule cards or Shift Board cards by default.
- Phone numbers must not be stored in `schedule_entries`, `shift_requests`, `coverage_offers`, shift board posts, import rows, audit summaries, or public examples.
- Use fake/demo phone numbers only for testing or seed data.
- Do not add patient phone numbers, emergency contacts, hire dates, payroll data, clinical notes, or EMR data.

## Permissions

- Authenticated department members can view Staff Directory records allowed by RLS.
- Admin users can create and edit staff profiles.
- Admin users mark staff inactive instead of deleting records.
- Staff users can view the directory but cannot edit other staff profiles.
- Staff self-edit is future functionality and is not implemented in Phase 3.

## UI Behavior

- The bottom navigation still uses the existing Staff tab.
- The visible page heading is `Staff Directory`.
- Admin create/edit includes display name, employment type, home assignment, phone number, email, preferred contact method, and active status.
- Phone numbers render as tap-to-call links.
- Email addresses render as tap-to-email links.
- Filters include All, Full-time, Per diem, Day Shift, Night Shift, PFT, Pulmonary Rehab, Flexible, Active, and Inactive.

## Out of Scope

- Moving schedule data to Supabase.
- Staff self-edit.
- Deleting staff profiles.
- Importing staff directory records from images or files.
- OCR, push notifications, native mobile, billing, payroll, EMR, or patient information.
