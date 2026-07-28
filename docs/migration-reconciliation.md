# Production Migration Reconciliation

Date: 2026-07-27

## Migration to Apply

Production has already received:

```text
202607270001_official_vent_count_updates.sql
```

Apply this migration next:

```text
202607270002_production_readiness_hardening.sql
```

Do not rerun or manually replay older migrations against production. The hardening migration is the
forward migration for existing environments and does not require a setup-code cleanup migration because
no setup-code table, column, token, or expiration schema exists in the tracked database history.

The new migration:

- establishes the atomic username activation function and normalized global username uniqueness
- removes the historical username-specific administrator constraint
- preserves stored, administrator-assigned roles
- adds access auditing and final-administrator protection
- hardens active-staff RLS helpers and protected column grants
- completes canonical vent publishing and deterministic source selection
- adds guarded schedule/offer transitions and duplicate-prevention indexes
- applies ICU validation/attribution, storage, realtime, and supporting security hardening

## Historical Filename Reconciliation

Four local migration files were assigned unique versions so a clean database can replay every migration
without duplicate Supabase version numbers:

| Current version | Historical filename/version |
| --- | --- |
| `202607040000_add_rt_aide_home_assignment.sql` | `202607040001_add_rt_aide_home_assignment.sql` |
| `202607040003_rental_check_in.sql` | `202607040002_rental_check_in.sql` |
| `202607040004_rental_check_in_hardening.sql` | `202607040003_rental_check_in_hardening.sql` |
| `202607060004_director_rental_snapshot_read.sql` | `202607060001_director_rental_snapshot_read.sql` |

This rename fixes source-control migration ordering but does not change production data. An existing
production database may record the historical version numbers, so inspect its migration table before a
future `supabase db push`.

```sql
select version, name, inserted_at
from supabase_migrations.schema_migrations
order by version;
```

If the renamed migration's schema effect is already present, mark the corresponding current version
applied with `supabase migration repair` rather than executing its DDL again. Do this only after verifying
the object or column named below:

| Version to reconcile | Verify first |
| --- | --- |
| `202607040000` | `rt_aide` exists in `staff_home_assignment` |
| `202607040003` | `rental_records`, `rental_events`, `rental_equipment`, and `rental_vendors` exist |
| `202607040004` | rental location/status hardening columns and constraints exist |
| `202607060004` | Director rental snapshot helper/policy exists |

Example commands after verification:

```powershell
npx supabase migration repair --status applied 202607040000
npx supabase migration repair --status applied 202607040003
npx supabase migration repair --status applied 202607040004
npx supabase migration repair --status applied 202607060004
```

If `202607270002` is run manually in the SQL Editor, also reconcile that version as applied before the
next CLI migration push:

```powershell
npx supabase migration repair --status applied 202607270002
```

## Production Verification

After applying the hardening migration, run:

```sql
select to_regclass('public.official_vent_count_updates');

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'staff_profiles_username_normalized_unique',
    'staff_profiles_auth_user_id_unique',
    'official_vent_count_updates_lookup_idx'
  )
order by indexname;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'claim_staff_profile',
    'reset_staff_account_link',
    'publish_lead_official_vent_count',
    'publish_icu_official_vent_count',
    'respond_to_shift_request_offer',
    'save_self_managed_shift'
  )
order by routine_name;

select tgname
from pg_trigger
where not tgisinternal
  and tgname in (
    'staff_profiles_normalize_username',
    'staff_profiles_protect_active_administrator',
    'staff_profiles_sync_and_audit_access',
    'shift_status_updates_publish_official_vent',
    'icu_patients_publish_official_vent'
  )
order by tgname;
```

Expected result: every listed relation, index, routine, and trigger is present.

## Clean-Replay Evidence

`supabase db reset` successfully applied all 52 repository migrations in version order on 2026-07-27.
The database functional smoke suite and RLS/security audit both passed against that clean schema.
