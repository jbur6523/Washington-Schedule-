# Authentication and Device Persistence

WHHS RT Schedule uses Supabase Auth for sign-in and session management.

## Keep Me Signed In

The login screen includes `Keep me signed in on this device`, checked by default.

This means the app persists the authenticated Supabase session on the current browser/PWA install using the normal Supabase browser auth mechanism. It is not password storage.

Users should stay signed in after:

- Refreshing the app
- Closing and reopening the browser or PWA
- Locking and unlocking the phone

Users can still be signed out when:

- They manually tap `Sign out`
- Their account is reset or revoked
- Browser/app storage is cleared
- Supabase invalidates or cannot refresh the session
- The auth provider session expires for security reasons

## Password Safety

WHHS RT Schedule must never store raw passwords.

Do not store passwords in:

- localStorage
- sessionStorage
- cookies
- IndexedDB
- Supabase tables
- app logs

Password inputs are never prefilled from app storage.

## Remembered Username

When `Keep me signed in on this device` is enabled, the login screen can also remember the assigned username.

Local key:

`whhs-remembered-username`

This stores the username on the device so the username field can be prefilled later. It does not store the password or any auth token. Users can clear the remembered username from the login screen. The app does not show a separate `Remember username only` option because keeping the device signed in already covers the username convenience.

## Supabase Session Settings

The browser Supabase client is configured with:

- `persistSession: true`
- `autoRefreshToken: true`
- `detectSessionInUrl: true`

The app relies on Supabase's managed session storage and refresh flow. It does not manually store access tokens or refresh tokens.

Server-rendered protected pages check the current Supabase user before routing. Protected route checks distinguish:

- loading/checking session
- authenticated and authorized
- authenticated but unauthorized
- unauthenticated
- temporary verification failure

Temporary profile, membership, or staff-profile lookup failures show a retry-friendly access verification message instead of a permanent permission denial. Real role mismatches still show the appropriate access-denied page.

## Role-Based Restore

When a persisted session is restored, the app still runs role/access routing:

- `command_center` routes to `/command-center`
- `director` routes to `/director/shift-status`
- `icu_command_center` routes to `/icu-command-center`
- Admin, Lead, Aide, and Staff use the normal app landing behavior

Persistent login does not weaken authorization. Staff still cannot access Command Center, Rental Management, or Director routes unless their role allows it.

Admin users are the app superuser for management review and testing. Admin Dashboard links to the staff schedule, Manage Schedule, Staff Directory, Cover/Switch, Gossip, Lead Command Board, Director Dashboard, ICU Command Center, ICU Snapshot, Rental Management, Order Management, communication boards, Short Shift Alert, and staff management tools. Non-admin role restrictions remain unchanged.

After login, the browser calls the no-store session status endpoint and waits for fresh server-confirmed role context before routing. This avoids reusing stale role/profile state when switching between Admin, Staff, Aide, Director, Command Center, and ICU Command Center accounts.

On sign out, app-level transient session state is cleared before redirecting to `/login`. Remembered username storage may remain when intentionally enabled, but role/profile authorization state is not reused.

## Staff Deactivation Access

Emergency stabilization on 2026-07-07 deferred staff deactivation lockout because the Phase 1 active-user hardening caused unstable login/access behavior in production deployments.

`staff_profiles.is_active` remains available for roster display/filtering, but the app no longer uses it as a hard login/session/protected-route gate.

Inactive-user enforcement should be redesigned later with safer management/IT approval, production schema verification, and role-by-role smoke testing. This phase does not implement tokenized invite/reset flows or global Supabase refresh-token revocation.

Deactivation preserves historical records such as schedules, rental history, orders, ICU events, shift updates, and visible staff attribution. Admin roster management may still show Active/Inactive state, but it is not currently an access revocation mechanism.

## Command Center Phone

The shared department phone login, `sputum`, can remain signed in on the department phone. Rental, shift update, and short-shift actions still require staff attribution where applicable.

Do not use the command-center account on shared public devices outside the department phone.

## Director Access

The Director login, `aloha`, can remain signed in on the director's trusted device. It restores to the read-only Shift Status page and does not gain Command Center, Rental Management, Admin, Staff Directory, or Gossip access.

## ICU Command Center

The shared ICU Command Center login, `ventilator`, can remain signed in on the ICU command device. It restores to `/icu-command-center` and is limited to operational ICU respiratory device/settings tracking.

## Account Reset Impact

If an admin resets or revokes an account, Supabase may invalidate existing sessions. The user may need to sign in again. After a successful sign-in, the trusted device can persist the new session again.
