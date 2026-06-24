# Washington-Schedule Pilot Bootstrap

This file documents the manual first-admin setup for the Washington Hospital respiratory department pilot.

The application now expects Supabase Auth plus database records that connect an authenticated user to a profile, department membership, and optional staff profile.

## Required Vercel Environment Variables

Add these values in Vercel for Production and Preview:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Use the Supabase Project URL and Publishable key from the Supabase dashboard. `SUPABASE_SECRET_KEY` is server-only and is required for the username claim/reset route handlers that create or unlink Supabase Auth users. Do not add a secret key or service-role key to any `NEXT_PUBLIC_` variable.

Redeploy after changing environment variables.

## Supabase Dashboard Settings

Recommended pilot settings:

- Authentication > URL Configuration > Site URL: set to the production Vercel URL.
- Authentication > URL Configuration > Redirect URLs: include the production URL and local development URL, such as `http://localhost:3000/**`.
- Authentication > Providers > Email: enabled.
- Authentication > Signups: disabled for invite/provision-only pilot access.
- Email confirmation: choose the hospital-approved flow before inviting staff. If enabled, users must confirm email before login.

## First Admin Setup

Before the first login, create the pilot records needed for username claiming:

- Washington Hospital
- Respiratory Department
- unclaimed `staff_profiles` row for Jonathan Burdick with username `burj` and assigned role `admin`

Use `supabase/bootstrap/first-admin.example.sql` as a starting point. It is not an automatic migration. Review it carefully and run it manually as a trusted project administrator.

After the bootstrap SQL is run, Jonathan can open the app, enter username `burj`, and create the first admin password through the claim flow. The claim route creates the Supabase Auth user, profile, and admin department membership server-side.

## Placeholder Rules

- Replace placeholder department data before running the bootstrap SQL.
- Do not use real phone numbers in bootstrap scripts unless hospital policy has approved staff directory contact storage.
- Do not add patient information, clinical notes, hire dates, emergency contacts, payroll data, or EMR data.

## Assigned Username Model

- Staff usernames are assigned by the department.
- Usernames are generated from the first 3 letters of the last name plus the first letter of the first name.
- `Bei Yi` is the special exception and receives `yibe`.
- Duplicates receive a numeric suffix.
- Username values are stored on `staff_profiles.username` and `staff_profiles.username_normalized`.
- Supabase Auth still uses email/password internally. The app maps a username to an internal auth email in server/client auth code.
- `burj` is the only admin username and belongs to Jonathan Burdick.
- Leads are represented with the `lead` membership role.

## Expected App Behavior

- Authenticated users with no department membership see a safe department-assignment message.
- Authenticated users with a membership but no linked staff profile can access basic permitted areas and see a provisioning message.
- Admin users can access `/admin`.
- Lead users receive lead role context but do not receive admin-only UI.
- Staff users cannot access `/admin`.
- The current Schedule, Manage Schedule, Shift Board, and Staff screens still use demo data until later backend data phases.
