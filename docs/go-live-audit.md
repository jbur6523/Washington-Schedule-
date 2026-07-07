# WHHS RT Schedule Go-Live Audit

Date: 2026-07-07  
Scope: full app static audit, subagent audit tracks, local lint/build/typecheck validation.  
Browser/live testing: not performed in this pass because this checkout does not include a real `.env.local` Supabase configuration, and no fresh live-test credentials were provided in this prompt.

## 1. Executive Summary

Overall readiness: Not Ready for broad go-live. Almost Ready for a controlled leadership review after the P0/P1 items below are addressed or explicitly accepted.

The app has strong functional coverage for the major operational workflows: schedule viewing, Command Center shift updates, Director shift status, rental lifecycle, Aide/Admin Order Management, and ICU Command Center. The most important current risks are not UI polish. They are account-claim security, migration history/schema drift, non-transactional workflow transitions, and unbounded rental history/export loading.

Recommended next step:
1. Close the public account-claim/security P0.
2. Reconcile Supabase migrations against the actual production migration table before any broad deployment.
3. Move high-value state transitions into database RPCs or guarded updates.
4. Run a live role-by-role smoke test against the deployed app after the above changes.

## 2. P0/P1 Findings

### P0 - Public username claim can create or reclaim operational accounts

Affected area: Auth / Login / Account Reset

What is wrong:
- `/api/auth/username-status` is public and reveals active username claim status plus display name.
- `/api/auth/claim` is public, uses the admin Supabase client, creates an auth user, inserts membership, and links the staff profile based on username plus password.
- The route contains a hard-coded first-admin path for `burj`.
- Admin reset makes a username claimable again.

Why it matters:
An attacker who knows or guesses an active unclaimed/reset username can attempt to claim an account. This is especially risky for admin and shared operational usernames.

Recommended fix:
- Replace username-only public claiming with one-time invite/reset tokens.
- Remove hard-coded admin promotion from public claim.
- Rate-limit and genericize username lookup responses.
- Block shared operational accounts from public claim after initial setup.

Fixed in this pass:
- Partially. The visible shared command-center setup password was removed from the login UI and docs. The public claim architecture itself was not changed because that is a security-sensitive auth flow rewrite.

### P1 - Supabase migration version prefixes are duplicated

Affected area: Database / Migrations

What is wrong:
Duplicate migration timestamp prefixes exist:
- `202607040001_add_rt_aide_home_assignment.sql`
- `202607040001_operations_dashboard_access.sql`
- `202607040002_add_wants_off_shift_request.sql`
- `202607040002_rental_check_in.sql`
- `202607060001_add_vaginal_delivery_shift_procedure.sql`
- `202607060001_director_rental_snapshot_read.sql`

Why it matters:
Supabase migration tooling treats the timestamp prefix as the migration version. Duplicate versions can block migration application or make production history reconciliation ambiguous.

Recommended fix:
- Compare local migrations to `supabase_migrations.schema_migrations` in production.
- Do not blindly rename migrations that have already been applied.
- Create a controlled migration reconciliation plan with unique versions for unapplied files.

Fixed in this pass:
- No. This is risky without live migration history.

### P1 - Staff deactivation does not reliably revoke app access

Affected area: Auth / Roles / Staff Profiles

What is wrong:
Admin staff profile editing persists `is_active`, but `getAuthenticatedUserContext()` derives role context from profile/membership without requiring the linked staff profile to be active. Several RLS membership helpers are also based on department membership, not staff active state.

Why it matters:
An inactive staff profile may still have authenticated department access if the auth profile and membership remain linked.

Recommended fix:
- On deactivation, remove/disable department membership and revoke sessions where possible.
- Make auth context and RLS helpers consistently require active staff where appropriate.
- Document whether inactive staff should retain directory visibility only.

Fixed in this pass:
- Yes, as a Phase 1 app-level hardening fix. The authenticated user context now requires a linked active `staff_profiles` row, inactive login/session restoration shows a friendly inactive-account message and signs out the browser session, protected server routes that use the shared auth helper deny inactive users, and RLS helper functions were updated to require active linked staff. Historical records remain preserved. Tokenized invite/reset flow and global Supabase refresh-token revocation remain separate future security phases.

### P1 - ICU migration repair does not fully restore ICU invariants

Affected area: ICU Command Center / Database

What is wrong:
The existing untracked ICU schema repair migration repairs tables, helper functions, and RLS, but it does not recreate the partial unique index that prevents more than one active ICU record per bed.

Why it matters:
If the original ICU migration only partially applied, production could allow duplicate active bed records while the UI expects a duplicate-bed database error.

Recommended fix:
- Add the partial unique index back into the repair migration after checking for duplicate active bed records.
- After backfill/validation, enforce not-null constraints for required ICU fields.

Fixed in this pass:
- No. The ICU repair migration was already untracked when this audit started. I did not modify or commit it without production migration context.

### P1 - Rental lifecycle updates are not guarded against stale state

Affected area: Rental Management

What is wrong:
Delivery confirmation, pickup request, pickup confirmation, and cancellations update records by id without requiring the expected starting status.

Why it matters:
Two users on stale screens can overwrite each other's workflow state or create confusing history.

Recommended fix:
- Add expected-status predicates to updates.
- Treat zero updated rows as a conflict and ask the user to refresh.
- Longer term, move lifecycle transitions plus event inserts into RPCs.

Fixed in this pass:
- No. This is workflow logic and should be handled in a targeted rental hardening phase.

### P1 - Rental history/export paths are unbounded

Affected area: Rental Management / Performance

What is wrong:
Rental pages load broad record/event sets and filter in memory. Export/feed endpoints read broad history and event sets, including a service-role Excel feed path.

Why it matters:
The app will slow down as rental history grows. The Excel feed is also operationally sensitive because it bypasses normal session/RLS with a static token.

Recommended fix:
- Add server/API pagination and date windows.
- Push rental search/date/status filters into Supabase.
- Scope the Excel feed token to a department and prefer bearer tokens over query-string tokens where Excel allows it.
- Add a rental event index by rental record id.

Fixed in this pass:
- No. This needs a dedicated data-loading/export pass.

## 3. P2 Findings

### Non-transactional schedule and Cover/Switch transitions

Affected workflows:
- Move/self-managed schedule transitions.
- Manual Cover/Switch posting.
- Accepting Cover/Switch offers.

Risk:
The app can leave partial state if one write succeeds and the next fails.

Recommended fix:
Move compound transitions into database RPCs or add robust rollback.

### Duplicate operational records can accumulate

Affected workflows:
- `add_self` overrides can duplicate because rendering dedupes but the database does not prevent them.
- Short Shift alerts can duplicate because the Command Center route always inserts a new active shortage.

Recommended fix:
Add partial unique indexes or route-level "existing active same shift" checks.

### Current-shift boundary constants are inconsistent

Affected area: Shift Status / Director View Shift

Risk:
The status resolver uses an `08:00-19:59` day shift window while Director View Shift defaults use `07:00-18:59`. The difference may be intentional for schedule preview versus operations, but it should be centralized and documented to prevent future mismatches.

Recommended fix:
Create one named shift-window helper for operational status and one named helper for schedule preview if both are required.

### Modal accessibility is uneven

Affected screens:
- ICU Command Center modals.
- Manage Schedule confirmation.
- Order Management create/order image/confirmation modals.
- Rental History filter disclosure controls.

Recommended fix:
Extract the stronger Staff Directory modal pattern into a shared modal shell with body scroll lock, focus handling, `role="dialog"`, `aria-modal`, Escape handling, and focus restoration.

### Shared data freshness is inconsistent

Affected areas:
- Shift status has realtime plus polling.
- Schedule, rental, orders, gossip, and ICU views mostly rely on load-on-open and local reloads.

Recommended fix:
Add targeted realtime subscriptions or explicit refresh affordances for shared operational dashboards.

### Image handling can grow expensive

Affected areas:
- Gossip images.
- Order Management thumbnails.

Recommended fix:
Keep pagination limits, add client-side image compression for order uploads, and consider signed URL caching/batching if image-heavy usage grows.

## 4. P3 Polish

- Bottom navigation active state was visual-only; this pass added `aria-current="page"` and a focus-visible ring.
- Some old docs and UI copy exposed the command-center setup password; this pass removed the visible password text from login and docs.
- Several buttons and modal controls would benefit from a shared app button and modal component, but this should be done carefully to avoid workflow regressions.
- Development-only auth fallback grants an admin-like context when Supabase env vars are missing. It is guarded to non-production, but should eventually require an explicit `ALLOW_DEV_AUTH_FALLBACK=true`.

## 5. Security/Privacy Review

Auth and roles:
- Role helpers are present and mostly consistent: Admin, Lead, Aide, Staff, Director, Command Center, and ICU Command Center are modeled.
- Director and Command Center routing is server-checked.
- Order Management is scoped to Admin/Aide.
- Rental Management is scoped to operations users and Command Center.
- ICU edit access is scoped to Admin/ICU Command Center, with Director/Command Center read-only access.

Security concerns:
- Public username claim/reset flow is the top security blocker.
- Staff deactivation needs to revoke membership/session access consistently.
- Rental Excel feed uses a static token and admin client; it must be managed like a secret integration.

Privacy:
- ICU code and docs intentionally avoid patient names, MRNs, DOBs, diagnoses, and patient-identifying notes.
- Rental and Order Management note fields keep no-patient-information warnings.
- Director Respiratory Directory intentionally exposes staff phone numbers to Director/Admin-style access only.

Secrets/env:
- `.env.example` contains placeholders only.
- No committed real secrets were found in the static scan.
- `RENTAL_EXCEL_SYNC_TOKEN` is correctly server-only by name, but the integration should avoid URL tokens where possible.

## 6. Workflow Review

Schedule:
- Day/Night/All filtering remains client-driven.
- Current Shift Status uses the shared shift-status resolver and `getStaffingStatus`.
- Staffed/Short threshold is centralized at `0.5`.
- Staff Schedule and Director both use the same staffing status helper.
- Wants Off and Remove Myself need live smoke testing after recent changes.

Manage Schedule:
- Past-shift hiding and night-shift crossing-midnight logic need live validation.
- Remove Myself is the only intended removal action after recent cleanup.
- Wants Off state should be guarded against duplicate rows in the database.

Cover/Switch:
- Core request/offer flows exist.
- Compound writes are not transactional.
- Duplicate prevention is partial.

Gossip Board:
- Staff-only UI is present.
- Image storage policies should be tightened so users cannot update/delete arbitrary department images.
- Moderation and retention policy are operational decisions before broad use.

Staff Directory / Profiles:
- Aide display and Director directory behavior exist.
- Phone visibility is intentional for Director directory.
- Inactive-staff auth access needs a policy fix.

Respiratory Command Center:
- Command Center routes are separated from normal staff app navigation.
- Shift Update uses lead/admin updater attribution, current counts, procedure tiles, and no-patient-info notes.
- `vaginal_delivery_count` exists in migrations and UI, but the client still falls back if the column is missing.

Director Dashboard:
- Read-only design is intact.
- Respiratory Directory and View Shift modal exist.
- Scheduled Procedures reset logic exists, but live validation is needed.
- Current Shift Status no-update handling should show friendly empty state, not scary errors.

Rental Management:
- Pending rentals are not counted as active in the visible summary.
- Quantity ordering creates multiple awaiting-delivery records.
- Lifecycle state transitions need stale-state guards.
- Export/feed performance needs hardening.

Order Management:
- Admin and Aide have full access.
- Create Order, Req Number, thumbnails, image preview, explicit search, last-7 default history, View All/Load More, View Notes, and To-Do List are implemented.
- Order lookup has a trigram index migration.
- No image placeholder is rendered when no image exists.

ICU Command Center:
- Active/discontinued model exists.
- No PHI fields were found in the schema.
- Read-only director/command center detail views exist.
- Current dirty worktree includes ICU read-only compatibility changes and an untracked ICU schema repair migration that should be reviewed before commit/deploy.

## 7. Database/Migration Review

Must resolve:
- Duplicate migration version prefixes.
- Confirm whether the untracked ICU repair migration is intended for production.
- Add/recreate ICU active-bed unique index if the repair migration is used.
- Confirm production has `vaginal_delivery_count`.
- Confirm `pg_trgm` exists before relying on the order Req Number trigram index.

Recommended indexes/constraints:
- Rental event index by `(department_id, rental_record_id, event_at)`.
- Partial unique active rental barcode/equipment protection after deduping data.
- Partial unique active Short Shift alert constraint if duplicates are not desired.
- Partial unique active `add_self` override constraint.

## 8. UI/Mobile Review

Screens audited statically:
- Staff Schedule
- Manage Schedule
- Cover/Switch
- Gossip
- Staff Directory
- Command Center
- Shift Update
- Director Shift Status
- Director View Shift modal
- Rental Management
- Order Rental
- Return Rental
- Rental History
- Order Management
- To-Do List modal
- Admin/Lead/Aide dashboards
- ICU Command Center

Issues found:
- Several custom modals need accessibility/focus improvements.
- Bottom nav needed active-state semantics; fixed in this pass.
- ICU modal body scroll/focus behavior is the largest mobile UX risk.

Screenshots:
- No new screenshots were taken in this audit pass.

## 9. Performance Review

Ready/acceptable:
- Order History defaults to 7 orders.
- View All/Load More prevents unlimited order rendering.
- Order lookup is explicit and database-backed.
- Current Shift Status polling/realtime is scoped.

Needs work:
- Rental history pages and export/feed are not paginated enough.
- Main schedule loader fetches broad active-version data.
- Image signing happens per visible row.
- Shared operational dashboards do not all have realtime/refresh behavior.

## 10. Fixes Applied

Files changed in this audit:
- `src/app/login/login-form.tsx`
- `src/app/login/page.tsx`
- `src/app/page.tsx`
- `src/app/api/auth/session-status/route.ts`
- `src/app/api/onboarding/contact/route.ts`
- `src/app/api/admin/staff-profiles/[id]/route.ts`
- `src/components/AdminRosterManagement.tsx`
- `src/components/InactiveAccountNotice.tsx`
- `src/components/BottomNavigation.tsx`
- `src/lib/auth/current-user.ts`
- `src/lib/auth/types.ts`
- `docs/command-center.md`
- `docs/auth.md`
- `docs/backend-schema.md`
- `docs/operations-dashboard.md`
- `docs/go-live-audit.md`
- `supabase/migrations/202607070006_enforce_active_staff_access.sql`

Fixes:
- Removed the visible shared command-center setup password from the login screen.
- Updated Command Center/Operations docs so the shared setup password is provided out of band instead of published.
- Added `aria-current="page"` and a focus-visible ring to the bottom navigation active tab.
- Added this production-readiness audit report.
- Added Phase 1 staff deactivation enforcement: inactive linked staff are blocked at login/session validation, protected route auth context, onboarding contact save, and database RLS helper checks.
- Added admin roster guardrails for access deactivation/reactivation, including self-deactivation blocking and clear success messages.

Why these fixes were safe:
- They do not change auth flow, routing, database schema, role permissions, or operational workflows.
- They reduce credential exposure and improve navigation accessibility.
- The deactivation work uses the existing `staff_profiles.is_active` field and preserves historical data instead of deleting profiles, memberships, or records.

## 11. Deferred Fixes

Separate prompt/phase recommended:
- Replace public username claim with one-time invite/reset tokens.
- Reconcile Supabase migration history with production.
- Add optional global Supabase refresh-token revocation for deactivated users if management wants immediate token invalidation beyond app-level denial on refresh/route check.
- Add guarded/RPC workflow transitions for rental and schedule actions.
- Add rental history pagination and scoped export/feed behavior.
- Add database uniqueness constraints after checking for existing duplicate rows.
- Extract shared accessible modal shell.
- Run full live smoke tests for each role.

## 12. Validation Results

Commands:
- `npm run lint`: passed
- `npm run build`: passed
- `npm run typecheck`: passed
- `npm test`: not run; no `test` script is defined in `package.json`

Manual/browser testing:
- Not performed in this pass. Local Supabase env is missing, and live browser testing should be done with fresh credentials provided for that session only.

Worktree note:
- Before this audit, the worktree already had `src/components/IcuReadOnlyViews.tsx` modified and `supabase/migrations/202607070005_icu_snapshot_schema_repair.sql` untracked. Those pre-existing changes were not reverted.
