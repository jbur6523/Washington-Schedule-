-- READ-ONLY POST-APPLY VERIFICATION. This file does not create orders or alter
-- catalog data.

select
  count(*) as total_rows,
  count(*) filter (where catalog_status = 'active' and is_orderable) as active_orderable_rows,
  count(*) filter (where catalog_status = 'discontinued' and not is_orderable) as discontinued_rows,
  count(*) filter (where catalog_status = 'do_not_use' and not is_orderable) as do_not_use_rows,
  count(*) filter (where review_required) as review_required_rows,
  count(*) - count(distinct pmm_number) as duplicate_pmm_rows
from public.pmm_catalog;

select
  catalog_status,
  is_orderable,
  review_required,
  count(*) as row_count
from public.pmm_catalog
group by catalog_status, is_orderable, review_required
order by catalog_status, is_orderable, review_required;

select
  relname as table_name,
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where oid in ('public.pmm_catalog'::regclass, 'public.department_order_lines'::regclass)
order by relname;

select
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('pmm_catalog', 'department_order_lines', 'department_orders')
order by tablename, policyname;

select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('pmm_catalog', 'department_order_lines')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('pmm_catalog', 'department_order_lines')
order by tablename, indexname;

select
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  p.proacl as function_acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('user_has_order_management_access', 'create_department_order_with_lines')
order by p.proname;

select
  conrelid::regclass as table_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.pmm_catalog'::regclass, 'public.department_order_lines'::regclass)
order by conrelid::regclass::text, conname;

select count(*) as unexpected_nonseed_status_rows
from public.pmm_catalog
where catalog_status not in ('active', 'discontinued', 'do_not_use');
