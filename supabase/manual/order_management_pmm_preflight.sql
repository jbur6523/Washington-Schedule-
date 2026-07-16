-- READ-ONLY PREFLIGHT. Run only after the target environment and migration
-- history have been reconciled by an approved operator.

select current_database() as database_name, current_user as database_user, version() as postgres_version;

select
  to_regclass('public.department_orders') as department_orders,
  to_regclass('public.departments') as departments,
  to_regclass('public.department_memberships') as department_memberships,
  to_regclass('public.staff_profiles') as staff_profiles,
  to_regclass('public.pmm_catalog') as existing_pmm_catalog,
  to_regclass('public.department_order_lines') as existing_department_order_lines;

select
  to_regprocedure('public.current_profile_id()') as current_profile_id,
  to_regprocedure('public.current_staff_profile_id(uuid)') as current_staff_profile_id,
  to_regprocedure('public.user_is_department_member(uuid)') as user_is_department_member,
  to_regprocedure('public.user_is_department_admin(uuid)') as user_is_department_admin,
  to_regprocedure('public.user_is_department_aide(uuid)') as user_is_department_aide,
  to_regprocedure('public.set_updated_at()') as set_updated_at;

select
  column_name,
  data_type,
  is_nullable,
  character_maximum_length
from information_schema.columns
where table_schema = 'public'
  and table_name = 'department_orders'
order by ordinal_position;

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.department_orders'::regclass
order by conname;

select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'department_orders'
order by policyname;

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'department_orders'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
