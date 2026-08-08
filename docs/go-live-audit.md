# WHHS Schedule Go-Live Audit

Date: 2026-07-27

Application timezone: `America/Los_Angeles`

Deployment model: Next.js App Router on Vercel with Supabase Auth, Postgres, RLS, Storage, and Realtime

## Readiness Result

The repository is buildable and deployable after the production database receives
`202607270002_production_readiness_hardening.sql`.

No unresolved code-level release blocker was found in the final verification pass. Production promotion
still requires the environment and organizational checks listed at the end of this document.

## Architecture and Authority

- Supabase Auth owns authenticated identities and sessions.
- `staff_profiles` is the administrator-created employee roster.
- `department_memberships.role` and the staff record's administrator-assigned access fields determine
  application permissions. Usernames never determine permissions.
- Server routes validate the authenticated Supabase user and its linked, active staff record.
- RLS enforces department and role boundaries on database reads and writes.
- Live operational data uses Supabase Realtime, explicit refetches, and polling/focus recovery where a
  missed subscription event would otherwise leave a stale screen.
- Schedule, Director Dashboard, and shared operational cards are dynamically rendered.

## Roles Reviewed

| Access | Primary behavior |
| --- | --- |
| Admin | Roster, role, schedule, and department administration |
| Lead | Lead Command Center and lead-authorized operational writes |
| Staff | Schedule, availability, requests, directory, and staff features |
| RT Aide | Staff access plus aide operations |
| Command Center | Command Center operational workflows |
| Director | Read-only leadership dashboard and approved directory/reporting views |
| ICU Command Center | ICU patient/device tracking and ICU mutations |

Route checks and RLS/database checks are both required; hiding a control is not treated as authorization.

## Critical Data Consistency

### Official ventilator count

`official_vent_count_updates` is the canonical, append-only shared vent source. Each event stores:

- department
- operational date and shift
- vent count
- Lead or ICU source
- server-generated creation time
- updater identity and display attribution when available

The current value is selected deterministically by the Vent event's field-specific
`created_at desc, id desc` across all operational dates and shifts.

- A genuine Lead vent change publishes after the Lead row is saved.
- A blank or omitted Lead vent value publishes nothing; zero remains a genuine value.
- An unrelated Lead save does not publish.
- A genuine ICU tracked-count change publishes after persisted ICU rows are recalculated.
- An unrelated ICU edit that leaves the tracked total unchanged does not publish.
- A refresh, refetch, page opening, or generic timestamp update does not publish.
- The ICU Command Center continues to show only its raw device-derived internal vent count.
- Department Snapshot, Director ICU Summary, and Schedule use the canonical official value.
- The Director ICU Summary continues to derive HFNC, BiPAP, and Critical Vents from raw ICU records.
- Loading and error states do not fall back to the raw ICU vent count.

Browser acceptance data verified the intended split:

- official Lead vents: `5`
- ICU internal vents: `6`
- Director Department Snapshot vents: `5`
- Director ICU Summary vents: `5`
- Schedule vents: `5`
- Director ICU Summary HFNC/BiPAP/Critical Vents: `1 / 2 / 0`

### Other operational writes

- Shift counts reject negative, fractional, or malformed values rather than silently storing zero.
- A legitimate zero remains distinct from missing data.
- Shift offer responses and self-managed schedule transitions use guarded database functions.
- Unique indexes prevent duplicate active schedule/request states covered by those workflows.
- Rental transitions retain guarded status checks and auditable event records.
- Mutation success is not shown until the server confirms persistence.

## Username Account Activation

The first-login workflow is username-only:

1. An administrator pre-creates a staff row and assigns its role.
2. The employee enters the assigned username and creates a password.
3. The server creates the Auth identity.
4. `claim_staff_profile` locks and links the matching active, unclaimed staff row in one transaction.
5. Later sign-ins use the same username and password.

No setup code, one-time claim token, expiration, regeneration, or administrator code-distribution path
exists.

Protections retained:

- A database trigger normalizes every username write.
- A global unique index enforces normalized username uniqueness.
- Unknown, inactive, or archived rows cannot be claimed.
- A staff row and Auth identity can each be linked only once.
- The claim function is executable only by the server service role.
- The deterministic Auth identity plus `FOR UPDATE` row locking makes concurrent claims single-winner.
- Client role fields are ignored; the membership inherits the stored administrator-assigned role.
- Activation responses do not expose role values or internal database identifiers.
- Contact and notification onboarding derive the linked staff identity from the authenticated session.
- Role/access changes are audited with actor, before/after state, and server timestamp.
- Advisory-lock-backed database triggers protect the final active administrator.
- Administrator self-demotion is blocked by the established policy.

## Date and Shift Logic

- Operational calculations explicitly use `America/Los_Angeles`.
- Day shift begins at 08:00 and night shift begins at 20:00.
- Times before 08:00 belong to the previous operational date's night shift.
- Date-only schedule values are formatted without browser-local UTC conversion.
- Wall-clock timestamp conversion handles daylight-saving transitions explicitly.
- Nonexistent spring-forward times are rejected.
- Repeated fall-back times resolve deterministically.
- Canonical vent queries are department-scoped and intentionally retain the last valid value across shift and date boundaries.

## Security and Privacy

- All public application tables have RLS and policies.
- Linked active-staff checks are used by the final membership helpers.
- Browser roles cannot write membership, profile, staff-linkage, or protected role columns.
- Staff activation/reset database functions are service-only.
- Role changes, activation/deactivation, account claiming, and account reset are audited.
- Storage update/delete policies are limited to owners or administrators where applicable.
- Service-role credentials are server-only and are not exposed through `NEXT_PUBLIC_` variables.
- Production error paths avoid raw database errors and stack traces.
- Security headers include CSP, HSTS, frame denial, MIME sniffing protection, referrer policy, and
  restricted browser permissions.
- CSV exports neutralize spreadsheet formula injection.
- No committed credentials or live secrets were found.
- ICU and operational forms warn against entering patient names, MRNs, DOBs, diagnoses, or clinical notes.

This engineering review does not establish HIPAA compliance. The organization must separately complete
its privacy, security, access-review, incident-response, retention, vendor/BAA, device-management, and
workforce-training obligations.

## Accessibility and Responsive Verification

The critical login, Schedule, Director, and ICU workflows were browser-tested at:

- 320 px
- 375 px
- 390 px
- 768 px portrait
- 1024 px landscape
- 1440 px desktop

The tested screens had no horizontal overflow, duplicate IDs, clipped controls, or interactive controls
smaller than the audited 40 px minimum. Form inputs retain mobile-safe font sizing. The Director ICU
detail dialog traps focus, closes with Escape, and restores focus to its opener.

## Verification Evidence

- TypeScript: passed
- ESLint: passed
- Vitest: 14 files, 88 tests passed
- Next.js production build: passed
- `npm audit --audit-level=low`: zero vulnerabilities
- Clean Supabase replay: all 52 migrations applied successfully
- Database functional smoke suite: passed and rolled back
- Database RLS/security audit: passed
- Two-session concurrent username claim: one winner, one safe failure
- Production-mode HTTP and browser smoke: passed; status 200 and no server stderr
- Production security-header inspection: passed
- Role-negative browser checks: regular staff denied Director and admin routes
- Production Director/Schedule/ICU vent split: passed

## Required Production Actions

1. Apply `supabase/migrations/202607270002_production_readiness_hardening.sql` after the already-applied
   `202607270001_official_vent_count_updates.sql`.
2. Reconcile renamed historical migration versions as described in `docs/migration-reconciliation.md`
   before using automated Supabase migration push against production.
3. Confirm Vercel has the production Supabase URL, publishable key, and server-only secret key.
4. Confirm Vercel deploys the tested commit and review its deployment logs.
5. Run a short deployed role smoke with representative Admin, Lead, Staff, Director, Command Center,
   Aide, and ICU accounts.
6. Complete the organization's privacy, BAA/vendor, retention, backup, recovery, and incident-response
   approvals before real-world operational use.
