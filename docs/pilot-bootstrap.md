# Washington-Schedule Pilot Bootstrap

This file documents the manual first-admin setup for the Washington Hospital respiratory department pilot.

The application now expects Supabase Auth plus database records that connect an authenticated user to a profile, department membership, and optional staff profile.

## Required Vercel Environment Variables

Add these values in Vercel for Production and Preview:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Use the Supabase Project URL and Publishable key from the Supabase dashboard. Do not add a secret key or service-role key to any `NEXT_PUBLIC_` variable.

Redeploy after changing environment variables.

## Supabase Dashboard Settings

Recommended pilot settings:

- Authentication > URL Configuration > Site URL: set to the production Vercel URL.
- Authentication > URL Configuration > Redirect URLs: include the production URL and local development URL, such as `http://localhost:3000/**`.
- Authentication > Providers > Email: enabled.
- Authentication > Signups: disabled for invite/provision-only pilot access.
- Email confirmation: choose the hospital-approved flow before inviting staff. If enabled, users must confirm email before login.

## First Admin Setup

After the first Supabase Auth user exists, create the matching pilot records:

- Washington Hospital
- Respiratory Department
- `profiles` row linked to the Auth user UUID
- `department_memberships` row with `admin` role
- `staff_profiles` row linked to the profile

Use `supabase/bootstrap/first-admin.example.sql` as a starting point. It is not an automatic migration. Review it carefully and run it manually as a trusted project administrator.

## Placeholder Rules

- Replace all placeholder UUIDs, names, and emails before running the bootstrap SQL.
- Do not use real phone numbers in bootstrap scripts unless hospital policy has approved staff directory contact storage.
- Do not add patient information, clinical notes, hire dates, emergency contacts, payroll data, or EMR data.

## Expected App Behavior

- Authenticated users with no department membership see a safe department-assignment message.
- Authenticated users with a membership but no linked staff profile can access basic permitted areas and see a provisioning message.
- Admin users can access `/admin`.
- Staff users cannot access `/admin`.
- The current Schedule, Manage Schedule, Shift Board, and Staff screens still use demo data until later backend data phases.
