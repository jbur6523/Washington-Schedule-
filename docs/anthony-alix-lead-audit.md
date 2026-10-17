# Anthony Alix Lead promotion

Migration: `20260909171904_promote_anthony_alix_to_lead.sql`.

The globally unique permanent `username_normalized = 'alia'` identifies the existing staff row. The migration updates only `assigned_role`, and synchronizes only the membership linked by both profile ID and department ID. It inserts no rows and leaves `operations_role`, active status, auth linkage, schedule, employment, and directory fields intact. Existing audit/update timestamp triggers continue to run normally. Missing identities are a no-op for empty/synthetic databases; production application must verify that exactly one `alia` row exists and ends with Lead role.

The `sync_and_audit_staff_access` trigger already propagates a changed role to a linked membership. The explicit membership update also repairs an already-Lead profile with a stale membership. A broken claimed linkage without a membership fails through the existing trigger instead of inventing an account. Future account claims inherit `staff_record.assigned_role` through `claim_staff_profile`.

## Repository audit

Whole-repository searches covered `assigned_role`, `department_memberships`, Lead role comparisons, Lead option arrays, `Select Lead`, `Updated By`, Anthony/Alix/alia, and database Lead helper references. No runtime hardcoded person list excludes Anthony. The name list in historical migration `202606240001_username_claim_and_lead_role.sql` is a one-time role seed, not an authorization or dropdown source. It remains unchanged.

| Area | Canonical behavior inspected |
| --- | --- |
| `ShiftUpdateClient.tsx` | Select Lead / Updated By queries department staff, active, assigned admin/lead, operations none; stores existing staff ID and name. |
| `LeadCommunicationBoardModal.tsx` | Same active Lead query for creation attribution; review, follow-up, close and reply access use authenticated role/shared access helpers and linked identity. |
| `RtAideNotesModal.tsx` | Same active Lead query for note attribution; Lead creation and response workflows use authenticated role. Aide selectors remain separate. |
| `auth/current-user.ts`, `auth/access.ts`, auth claim API | Active linked staff is required; context role comes from the matching department membership. Shared access helpers grant normal Lead permissions. No operations-role promotion required. |
| Command Center routes | Board, Shift Update, history, schedule, phone list and short-shift alert use `canManageShiftStatus`. `CommandCenterClient` passes the same context to its Lead tools. |
| Navigation and schedule | `admin/navigation.ts`, `BottomNavigation`, `app-client.tsx`, operations page: role-based Lead dashboard navigation and short-shift management. |
| Short-shift and announcement APIs | Lead membership/context permits short-shift management and department announcements; no username exceptions. |
| Rentals and director Shift Status | Shared access helpers include normal Leads. Admin-only metrics/order management and dedicated ICU access remain governed by their existing permission matrix. |
| Attribution displays | `LeadOperationalSummary`, `CurrentShiftStatusSummary`, `ShiftRecordDetails`, `ShiftHistory`, `ShiftStatusPrintLayout`, `DirectorShiftStatusClient`, `DirectorDashboardIcuSummary`, `IcuReadOnlyViews` consume stored attribution; no separate Lead identity list. |
| Lead schedule directory and phone list | Staff directory uses active directory records, not a privileged-name list. Phone assignment choices use staff data. Access uses the shared Lead checks. |
| Admin roster/API | Assigned roles are validated against role enums; existing trigger synchronizes profile edits. Operations roles are a distinct model. |
| Database authorization | Latest `user_is_department_lead` / `user_is_department_lead_or_admin` use active linked staff plus department membership. Their RLS consumers cover shift board/status, rentals, RT Aide notes/replies, Lead communication, phone lists, announcements and roster/history. Later leadership policies add separate leadership access without replacing Lead membership checks. |
| Database attribution/actions | `enforce_shift_status_attribution`, `save_shift_status_update`, official vent publication and communication reply/read-state functions use the canonical helpers or active staff role query. No person allowlist. |

## Verification and rollout

- `npm test -- src/components/AnthonyLeadOptions.test.tsx src/lib/auth/anthony-lead-access.test.ts`: 18 tests pass. All three real selectors offer active Anthony once by existing ID, and exclude inactive/non-Lead/other-department/special-operations variants. Auth resolution grants Lead access from membership and rejects inactive staff.
- `node scripts/anthony-lead-database-test.mjs`: five rollback-isolated scenarios pass against the local synthetic database: claimed, unclaimed, inactive, stale membership and missing identity. Executes the actual migration twice, compares unrelated fields, verifies database Lead authorization, and saves real Shift Update attribution as Anthony.
- `npm test`: 76 files / 470 tests pass.
- `npm run typecheck`: passes.
- `npm run lint`: passes.
- `npx supabase test db --local --profile supabase`: all 76 database tests across five files pass.

## Production rollout — 2026-10-17

Applied the unchanged migration above through the Supabase migration API to the WHHS project `xkhqdcxnllogiogahdmd`. The API recorded version `20261017205851`, name `promote_anthony_alix_to_lead`; this is the deployed counterpart of repository version `20260909171904`. Preserve this mapping when reconciling migration history; do not blindly push unrelated pending migrations.

Preflight found exactly one Anthony Alix account (`alia`), active and already claimed, with both staff and membership roles set to `staff`. Both now read `lead`, matching the established respiratory leads; `operations_role` remains `none`. The existing staff ID is unchanged. No duplicate account was created.

Post-deployment comparisons confirmed unchanged staff fields (except role and automatic update timestamp), unchanged membership fields (except role and automatic update timestamp), unchanged authentication credentials, and unchanged roles for every other staff record and department membership. Under Anthony's authenticated database identity, `user_is_department_lead` returns true and the shared Lead-selector predicates return his existing profile exactly once through RLS.

Rechecked all four Lead query sites: Shift Update server preload and client fallback, Lead Communication attribution, and RT Aide Notes attribution. Each queries active department `staff_profiles` with assigned role admin/lead and operations role none. There are no separate hardcoded person lists. Rental staff choices also include assigned Leads. Scheduling uses `is_shift_lead` on individual assignments for Lead hours/display; account promotion does not turn regular assignments into Lead shifts.

Current verification: 45 focused application tests passed (selector, authenticated access, access matrix, Lead directory, and Lead shift scheduling), all five rollback-isolated migration scenarios passed, and TypeScript validation passed. Selector rendering was verified with component tests and production query/RLS checks, not an interactive production browser session. No application runtime changes or rebuild were required.

Final full-suite verification: `npm test` passed 677 tests across 105 files, with one test/file skipped. `npm run lint` passed. Existing unrelated `artifacts/` files were left unchanged.
