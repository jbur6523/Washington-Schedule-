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

## First-Time Contact Setup

After an unclaimed user creates their password, the app shows an optional Contact Info step before entering the app.

Fields:

- Phone Number
- Email

Both fields are optional and can be skipped. If entered, the values are trimmed and saved to the linked `staff_profiles` record. Email uses basic format validation when provided.

The setup copy tells users these fields are optional and visible to others in the Staff Directory. Contact email is directory visibility only; the app does not send email notifications in the current pilot.

Returning claimed users are not forced through contact setup on every login. Staff can update contact information later when self-edit/settings are available.

## Permissions

- Authenticated department members can view Staff Directory records allowed by RLS.
- The normal Staff Directory is a shared contact directory and does not show usernames, claim status, auth links, or reset controls.
- Admin users can create and edit staff profiles.
- Admin users can assign `lead` or `staff` roles. Only username `burj` is admin.
- Admin users can reset/unclaim staff accounts without deleting the staff profile.
- Admin users mark staff inactive instead of deleting records.
- Staff users can view the directory but cannot edit other staff profiles.
- Lead users have the same Staff Directory privacy as staff unless they also have admin permissions.
- Staff self-edit is future functionality and is not implemented in Phase 3.

## Normal Directory Visibility

The normal Staff Directory is safe for all authenticated department users. It shows:

- Display name
- Employment type
- Home assignment
- Phone number, if present
- Email, if present
- Preferred contact method
- Active/inactive status when available

It does not show:

- `username`
- `username_normalized`
- Claimed/unclaimed account status
- `account_claimed_at`
- `auth_user_id` or profile linkage
- Reset/unclaim account controls
- Admin-only provisioning details

Normal directory filters are limited to All, Full-time, Per diem, Day Shift, Night Shift, PFT, Pulmonary Rehab, Flexible, Active, and Inactive.

## Admin Roster Management

Admins can open a separate `Admin Roster Management` section from Staff Directory. This admin-only panel contains roster provisioning details:

- Assigned username
- Assigned role
- Claimed/unclaimed status and claimed date
- Reset/unclaim controls
- Manual add/edit
- Batch roster creation
- Admin-only filters for role and account state

Staff and lead users cannot see this panel. Account-management actions remain protected by UI role checks, server-side API checks, and Supabase RLS.

## Username and Role Rules

- Usernames are assigned by the department, not chosen by users.
- Username format is first 3 letters of last name plus first letter of first name.
- Normalize by lowercasing and removing spaces, hyphens, apostrophes, and punctuation.
- Append a number for duplicates, such as `burj2`.
- `Bei Yi` is always `yibe`.
- `burj` is reserved for Jonathan Burdick and is the only admin username.
- Lead defaults are Allan Timbang, Jonathan Burdick, Heather Heath, Tom Nguyen, Win Hlaing, Bei Yi, Katryna Vuong, Joann Devera, Victor Davis, Jean Rodrillo, Gene Benoza, and Stephanie Ortiz.
- Usernames are permanent after account claim. Admins can regenerate usernames only while a profile is unclaimed.

## Username-Based Imports

Schedule imports should use permanent usernames whenever possible because printed schedules may use legal names, preferred names, or nicknames that differ from Staff Directory display names.

Known preferred-name mappings:

- John Roberts / Marshall Roberts imports as `robm`.
- Yiqin Meng / Maggie imports as `menm`.
- Pawanjit Khera / Kinty imports as `pawk`.
- Harjot Kaur / Joy imports as `kauj`.
- Bei Yi imports as `yibe`.

Schedule Code Import matches `staff_identifier` against `username_normalized` before trying display-name or last-name fallbacks.

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
- Claimed staff profiles show claimed status and claimed date only in the admin roster management panel.
- Admin reset/unclaim clears the auth/profile link so the staff member can create a new password again.
- Resetting an account does not delete the staff profile and does not delete historical schedule/request records.

## UI Behavior

- The bottom navigation still uses the existing Staff tab.
- The visible page heading is `Staff Directory`.
- Normal Staff Directory cards show contact/profile details only.
- Admin create/edit includes display name, employment type, home assignment, phone number, email, preferred contact method, active status, assigned username, and role.
- Phone numbers render as tap-to-call links.
- Email addresses render as tap-to-email links.
- Normal filters include All, Full-time, Per diem, Day Shift, Night Shift, PFT, Pulmonary Rehab, Flexible, Active, and Inactive.
- Admin-only roster filters may include Admin, Lead, Staff, Claimed, and Unclaimed.

## Out of Scope

- Moving schedule data to Supabase.
- Staff self-edit.
- Deleting staff profiles.
- Importing staff directory records from images or files.
- OCR, push notifications, native mobile, billing, payroll, EMR, or patient information.
