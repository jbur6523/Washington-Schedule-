# Migration Reconciliation

Date: 2026-07-07

This report inventories the local Supabase migrations and gives a production-safe reconciliation plan. It does not prove production Supabase state. Run the verification SQL below in Supabase before broad deployment or migration cleanup.

## Summary

- Do not rename already-applied migration files without checking `supabase_migrations.schema_migrations` in production.
- Leave duplicate timestamp prefixes in place if production may already know those versions. Use unique timestamps for all future migrations.
- Prefer forward-only repair migrations with `if not exists`, `create or replace function`, and `drop policy if exists` before `create policy`.
- Do not drop, truncate, or rename production data during reconciliation.
- The pre-existing ICU dirty files are needed compatibility/repair work and should be kept, with production verification.

## Duplicate Timestamp Prefixes

These local migration timestamp prefixes are duplicated:

- `202607040001`
  - `202607040001_add_rt_aide_home_assignment.sql`
  - `202607040001_operations_dashboard_access.sql`
- `202607040002`
  - `202607040002_add_wants_off_shift_request.sql`
  - `202607040002_rental_check_in.sql`
- `202607060001`
  - `202607060001_add_vaginal_delivery_shift_procedure.sql`
  - `202607060001_director_rental_snapshot_read.sql`

Risk:

- Supabase migration tooling keys migration history by version prefix. Duplicate prefixes are not data-destructive by themselves, but they make production history ambiguous and can cause future CLI migration runs to skip or fail files unexpectedly.

Recommended handling:

- Do not rename these files unless production confirms the affected versions were never applied.
- If production already applied one file from a duplicate group manually, use a new forward-only repair migration for any missing effects instead of editing history.
- Future migration filenames must use unique prefixes.

## Pre-Existing ICU Dirty Files

### `src/components/IcuReadOnlyViews.tsx`

Status: keep and commit.

Why:

- This component is imported by the Director Shift Status dashboard and the Command Center ICU snapshot page.
- The current change adds a fallback read path if optional ICU lifecycle columns are missing: `ventilator_outcome`, `discontinued_at`, and `discontinued_by_staff_profile_id`.
- This fallback makes the Director/Command Center read-only ICU views fail gracefully during schema drift, while logging the missing-column issue.

Risk:

- Low. This is client read fallback only. It does not mutate ICU data.

### `supabase/migrations/202607070005_icu_snapshot_schema_repair.sql`

Status: keep and commit as a forward-only ICU schema repair migration.

Why:

- The user reported the ICU Snapshot works after missing migrations were applied manually.
- This file consolidates the ICU schema, helpers, RLS policies, event table, indexes, and snapshot-count function using mostly idempotent patterns.
- It is useful as the source-controlled record of the repair state.

Risk:

- If this exact migration version was already marked applied in production manually, Supabase will not run it again from the CLI. Verify production migration history before relying on it.
- It overlaps earlier ICU migrations by design. That is acceptable for a repair migration, but production verification is required.

## Migration Inventory

| Migration | Purpose | Safety / idempotency | Production verification |
| --- | --- | --- | --- |
| `202606230001_backend_foundation.sql` | Core departments, profiles, staff, schedules, requests, helpers, RLS foundation. | Mostly idempotent with guarded enum/table/index/function creation. | Verify core tables, role enum, helper functions, RLS policies. |
| `202606240000_add_lead_role.sql` | Adds `lead` role. | Safe enum add guarded. | Verify `lead` exists in `app_role`. |
| `202606240001_username_claim_and_lead_role.sql` | Username normalization/claim fields and lead-role support. | Mostly idempotent; updates existing data/functions. | Verify username columns/indexes/functions. |
| `202606240002_self_managed_schedule_and_shift_board.sql` | Self-managed schedule overrides, shift shortages, request board support. | Mostly idempotent; creates tables/policies/functions. | Verify override/request tables and policies. |
| `202606240003_pwa_push_notifications.sql` | Push subscription and notification tables. | Mostly idempotent. | Verify notification tables and indexes. |
| `202606240004_shift_request_offer_workflows.sql` | Coverage/switch offer workflow tables. | Mostly idempotent. | Verify offer tables/indexes. |
| `202606240005_notification_center_and_offer_push.sql` | Notification event columns and policies. | Mostly idempotent but updates existing rows. | Verify notification columns/policies. |
| `202606240006_schedule_import_review_workflow.sql` | Schedule import review fields. | Idempotent column/index adds. | Verify import review columns. |
| `202606240007_pawanjit_khera_username.sql` | Username-generation exception/update. | Function replace and targeted update. | Verify username value if needed. |
| `202606240008_self_reported_availability.sql` | Adds `add_available` override type and uniqueness. | Guarded enum/index. | Verify enum value and unique index. |
| `202606240009_username_exceptions.sql` | Username-generation exception/update. | Function replace and targeted update. | Verify username values if needed. |
| `202606240010_coworker_titles.sql` | Coworker title system. | Mostly idempotent. | Verify coworker title table/policies. |
| `202606240011_custom_coworker_titles.sql` | Custom title fields/functions. | Mostly idempotent; data updates. | Verify title columns and helper. |
| `202606240012_staff_status_updates.sql` | Staff status message fields. | Idempotent columns/constraint. | Verify status fields. |
| `202606260001_shift_lead_entries.sql` | Shift lead markers on schedule/import rows. | Idempotent columns/index. | Verify `is_shift_lead`. |
| `202606260002_gossip_board.sql` | Gossip Board table, RLS, private storage helper/bucket. | Mostly idempotent. | Verify table, bucket, policies. |
| `202607040001_add_rt_aide_home_assignment.sql` | Adds `rt_aide` home assignment enum. | Guarded enum add. Duplicate prefix. | Verify enum value; do not rename without production check. |
| `202607040001_operations_dashboard_access.sql` | Adds `operations_role`. | Idempotent column; drops/recreates constraint. Duplicate prefix. | Verify operations roles and constraints. |
| `202607040002_add_wants_off_shift_request.sql` | Adds `wants_off` request type. | Guarded enum add. Duplicate prefix. | Verify enum value. |
| `202607040002_rental_check_in.sql` | Rental tables, vendors, events, rental access helper/RLS. | Mostly idempotent. Duplicate prefix. | Verify rental tables and helper policies. |
| `202607040003_rental_check_in_hardening.sql` | Rental location/status hardening. | Idempotent columns/constraints; data updates. | Verify rental columns/constraints. |
| `202607040005_rental_status_pickup_states.sql` | Pickup status enum values. | Guarded enum adds. | Verify rental status enum values. |
| `202607040006_rental_called_in_delivered_times.sql` | Pending delivery/called-in lifecycle fields/events. | Mostly idempotent. | Verify pending delivery columns/policies. |
| `202607050001_rental_return_equipment_workflow.sql` | Pickup request and return fields. | Idempotent columns/indexes/constraints. | Verify pickup/return columns. |
| `202607050002_pending_rental_cancellations.sql` | Delivery/pickup cancellation status/events/columns. | Mostly idempotent. | Verify cancellation columns/statuses. |
| `202607050003_rental_barcode_number.sql` | Barcode fields and uniqueness. | Idempotent column/constraint/index. | Verify barcode columns/indexes. |
| `202607050004_command_center_shift_status.sql` | Command Center user, shift status table, rental/short-shift policies. | Mostly idempotent; seeds shared users. | Verify shift status table and shared users. |
| `202607050005_shift_status_decimal_rts_needed.sql` | Makes RTs needed decimal. | Not fully idempotent, but safe if already numeric-compatible. | Verify `shift_status_updates.rts_required` is numeric. |
| `202607050006_aide_order_management.sql` | Department order table, storage bucket/policies. | Mostly idempotent. | Verify table, bucket, policies. |
| `202607050007_admin_order_management_view.sql` | Admin read access for orders. | Policy replacement. | Verify admin read policy. |
| `202607050008_admin_order_management_full_access.sql` | Admin create access for orders. | Policy replacement. | Verify admin create policy. |
| `202607050009_department_orders_req_number.sql` | Optional Req Number and order constraint update. | Idempotent column/constraint. | Verify `req_number`. |
| `202607060001_add_vaginal_delivery_shift_procedure.sql` | Adds `vaginal_delivery_count`. | Idempotent column/constraint. Duplicate prefix. | Verify column exists; known manually applied candidate. |
| `202607060001_director_rental_snapshot_read.sql` | Director rental snapshot read helper/policies. | Function/policy replacement. Duplicate prefix. | Verify director helper/policy. |
| `202607060002_order_management_todo.sql` | Shared Order Management To-Do List. | Mostly idempotent. | Verify table/policies. |
| `202607060003_department_order_history_indexes.sql` | Order history and Req Number indexes. | Idempotent extension/indexes. | Verify `pg_trgm` and indexes. |
| `202607070001_icu_command_center.sql` | ICU Command Center table, base policies, ICU shared user. | Mostly idempotent, but initial table shape can be superseded by repair. | Verify ICU table, helper functions, policies, `ventilator` user. |
| `202607070002_icu_patient_history.sql` | ICU event/history table and ventilator outcome. | Mostly idempotent. | Verify event table and outcome column. |
| `202607070003_staff_icu_snapshot_counts.sql` | ICU snapshot count function. | Function replacement. | Verify function exists. |
| `202607070004_icu_daily_activity_history.sql` | ICU discontinue/event_time fields and indexes. | Idempotent columns/indexes. | Verify `event_time`, discontinued fields. |
| `202607070005_icu_snapshot_schema_repair.sql` | Forward ICU schema repair after drift/manual migration. | Mostly idempotent repair migration. | Verify production history before expecting CLI to run it. |
| `202607070006_enforce_active_staff_access.sql` | Active staff access/RLS helper hardening. | Function replacement. | Verify active-user helpers. |
| `202607070007_guard_rental_lifecycle_transitions.sql` | Guarded rental lifecycle transition functions. | Function replacement. | Verify rental RPCs. |

## Important Code-to-Schema Expectations

### Auth / Staff

- `staff_profiles.is_active`
- `staff_profiles.operations_role`
- `department_memberships.role`
- Helpers: `user_is_department_member`, `user_is_department_admin`, `user_is_department_lead`, `user_is_department_lead_or_admin`, `current_staff_profile_id`, `user_is_command_center`, `user_is_department_director`, `user_is_department_aide`, `user_can_manage_rentals`

### Shift Status

- `shift_status_updates.rts_required` must support decimals.
- `shift_status_updates.vaginal_delivery_count` must exist for persisted Vaginal Delivery counts.
- Command Center and Director code contain fallback behavior for missing `vaginal_delivery_count`, but production should still receive the migration.

### Rental

- Tables: `rental_records`, `rental_events`, `rental_equipment`, `rental_vendors`
- Columns: `barcode_number`, `serial_number`, `current_location`, pending delivery fields, pickup request fields, cancellation fields, return fields
- Functions: `create_pending_rental_delivery`, `confirm_rental_delivery`, `call_rental_pickup`, `cancel_rental_pickup`, `confirm_rental_picked_up`, `cancel_rental_delivery`

### Order Management

- Table: `department_orders`
- Columns: `req_number`, `image_storage_path`, `image_url`, `notes`, creator fields
- Table: `order_management_todo`
- Indexes: `department_orders_created_at_idx`, `department_orders_req_number_idx`

### ICU

- Table: `icu_patients`
- Columns: active device fields, `is_critical_vent`, `ventilator_outcome`, `discontinued_at`, `discontinued_by_staff_profile_id`
- Table: `icu_patient_events`
- Columns: `event_time`, `event_type`, `event_summary`, `event_data`, creator fields
- Helpers: `user_can_manage_icu_patients`, `user_can_view_icu_patients`, `get_current_icu_snapshot_counts`

### Excel Feed

- No extra schema beyond rental history tables/events.
- `RENTAL_EXCEL_SYNC_TOKEN` is an environment-only server secret and should not be stored in the database or exposed with `NEXT_PUBLIC_`.

## Production Verification SQL

Run these checks in Supabase SQL Editor and compare results against this repo before deployment.

### Migration History

```sql
select version, name, inserted_at
from supabase_migrations.schema_migrations
order by version;
```

Check duplicate local prefixes against production:

```sql
select version, count(*)
from supabase_migrations.schema_migrations
group by version
having count(*) > 1
order by version;
```

### Expected Tables

```sql
select
  to_regclass('public.staff_profiles') as staff_profiles,
  to_regclass('public.shift_status_updates') as shift_status_updates,
  to_regclass('public.rental_records') as rental_records,
  to_regclass('public.rental_events') as rental_events,
  to_regclass('public.rental_equipment') as rental_equipment,
  to_regclass('public.department_orders') as department_orders,
  to_regclass('public.order_management_todo') as order_management_todo,
  to_regclass('public.icu_patients') as icu_patients,
  to_regclass('public.icu_patient_events') as icu_patient_events;
```

### Important Columns

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'staff_profiles',
    'shift_status_updates',
    'rental_records',
    'rental_events',
    'rental_equipment',
    'department_orders',
    'order_management_todo',
    'icu_patients',
    'icu_patient_events'
  )
order by table_name, ordinal_position;
```

Focused shift-status check:

```sql
select column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public'
  and table_name = 'shift_status_updates'
  and column_name in (
    'rts_on',
    'rts_required',
    'vent_count',
    'bipap_count',
    'c_section_count',
    'vaginal_delivery_count',
    'cabg_count',
    'bronch_count',
    'sputum_induction_count',
    'other_procedure_count'
  )
order by ordinal_position;
```

Focused ICU check:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'icu_patients'
  and column_name in (
    'bed',
    'device_type',
    'is_critical_vent',
    'ventilator_outcome',
    'discontinued_at',
    'discontinued_by_staff_profile_id',
    'is_active'
  )
order by ordinal_position;
```

### Helper / RPC Functions

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'user_is_department_member',
    'user_is_department_admin',
    'user_is_department_lead',
    'user_is_department_lead_or_admin',
    'current_staff_profile_id',
    'user_is_command_center',
    'user_is_department_director',
    'user_is_department_aide',
    'user_can_manage_rentals',
    'create_pending_rental_delivery',
    'confirm_rental_delivery',
    'call_rental_pickup',
    'cancel_rental_pickup',
    'confirm_rental_picked_up',
    'cancel_rental_delivery',
    'user_can_manage_icu_patients',
    'user_can_view_icu_patients',
    'get_current_icu_snapshot_counts'
  )
order by routine_name;
```

### RLS Policies

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'staff_profiles',
    'shift_status_updates',
    'rental_records',
    'rental_events',
    'department_orders',
    'order_management_todo',
    'icu_patients',
    'icu_patient_events'
  )
order by tablename, policyname;
```

### Indexes

```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'department_orders_created_at_idx',
    'department_orders_req_number_idx',
    'rental_records_department_status_idx',
    'rental_events_department_idx',
    'rental_records_department_barcode_idx',
    'rental_records_department_pickup_requested_idx',
    'rental_records_department_returned_idx',
    'icu_patients_department_active_idx',
    'icu_patients_department_bed_idx',
    'icu_patients_department_device_idx',
    'icu_patients_department_updated_idx',
    'icu_patient_events_patient_created_idx',
    'icu_patient_events_department_created_idx',
    'icu_patient_events_event_time_idx',
    'icu_patient_events_type_time_idx',
    'icu_patient_events_patient_time_idx'
  )
order by tablename, indexname;
```

### ICU Duplicate Active Bed Check

Run before enforcing or relying on active-bed uniqueness:

```sql
select department_id, bed, count(*) as active_count
from public.icu_patients
where is_active = true
group by department_id, bed
having count(*) > 1;
```

### Active Staff / Access Sanity Checks

```sql
select username_normalized, display_name, is_active, operations_role
from public.staff_profiles
where username_normalized in ('sputum', 'aloha', 'ventilator')
order by username_normalized;
```

```sql
select username_normalized, display_name, is_active
from public.staff_profiles
where is_active = false
order by display_name;
```

## Repair Strategy

If production verification shows drift:

1. Prefer a new migration with a unique timestamp.
2. Use only forward-safe operations:
   - `create table if not exists`
   - `alter table ... add column if not exists`
   - `create index if not exists`
   - `create or replace function`
   - `drop policy if exists` before `create policy`
3. Do not drop data, truncate tables, remove columns, or rewrite historical migration names.
4. If a duplicate-prefix migration is missing in production, do not assume the CLI will apply it. Create a new repair migration containing only the missing effects.
5. If an existing repair migration was manually run in production, confirm whether its version appears in `supabase_migrations.schema_migrations` before relying on CLI deploy behavior.

## Deferred Checks

- Confirm production migration history directly in Supabase.
- Confirm whether `202607070005_icu_snapshot_schema_repair.sql` was manually added to `schema_migrations`.
- If production has ICU duplicate active beds, resolve them before enforcing active-bed uniqueness.
- Consider adding a non-ambiguous future migration to backfill or validate missing ICU constraints after production state is known.
