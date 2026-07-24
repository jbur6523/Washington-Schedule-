-- READ-ONLY verification for 202607240001_lead_command_phone_list.sql.

select
  to_regclass('public.phone_list_drafts') as drafts_table,
  to_regclass('public.phone_list_assignments') as assignments_table,
  to_regprocedure('public.save_phone_list_draft(uuid,date,text,jsonb)') as save_rpc;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('phone_list_drafts', 'phone_list_assignments')
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('phone_list_drafts', 'phone_list_assignments')
order by tablename, policyname;

select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_phone_list_draft';

select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.phone_list_drafts'::regclass,
  'public.phone_list_assignments'::regclass
)
order by table_name::text, conname;

select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('phone_list_drafts', 'phone_list_assignments')
order by tablename, indexname;

select version
from supabase_migrations.schema_migrations
where version = '202607240001';
