# Atomic Schedule Import Production Rollout

No production action is authorized by this document. It is the future reviewed sequence.

1. Take timestamped exports of the active version, affected schedule rows, import audits, overrides, requests/offers, and current migration history.
2. Run `operations/migration-drift/verify-20260817112607.sql`. If `safe_to_mark_applied` is true and the detail rows agree, record the already-present migration with the pinned CLI only after confirming the linked ref is exactly `xkhqdcxnllogiogahdmd`:

   ```powershell
   npx supabase@2.115.0 projects list
   npx supabase@2.115.0 migration list --linked
   npx supabase@2.115.0 migration repair --status applied 20260817112607 --linked
   ```

   If the state is not present, do not mark it applied. Execute the unchanged `20260817112607_correct_lead_schedule_directory_staff.sql` in one reviewed production transaction, rerun the read-only check, then record the version as applied.
3. Follow the duplicate-repair runbook. Require `16/18/17/18` and zero exact duplicates.
4. Re-export and compare canonical schedule rows. Confirm overrides, requests/offers, Shift Leads, Short Shifts, leadership/current-shift views, Shift History, phone-list snapshots, and printing.
5. Apply only the reviewed additive migration `20260820085153_atomic_schedule_import.sql`. Its precondition intentionally aborts if any exact duplicate remains. Do not use unrestricted `supabase db push`.
6. Deploy the reviewed application build. Preview may be used only if its Supabase variables point exclusively to an isolated database; the current production-connected Preview is not a sandbox.
7. Sign in as a production administrator, preview a small known duplicate-only code sample, verify it reports skips, then perform a separately approved small import and read back its audit/result.
8. Monitor application/runtime errors, database function errors, import attempts, schedule counts, realtime refresh, and active-version range for at least one full staffing workflow cycle.
9. If the application misbehaves, roll back the application deployment first. The additive schema may remain because old readers are compatible. If database rollback is required, stop imports, export all new audit/entry IDs, reverse only reviewed additive objects with a dedicated rollback script, and never restore the 120 invalid duplicates.

The app migration and data repair are deliberately separate: repair first, additive uniqueness second, application last.
