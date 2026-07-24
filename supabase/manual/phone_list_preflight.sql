-- READ-ONLY preflight for the Lead Command Board Phone List migration.
-- Run against the approved target before applying 202607240001_lead_command_phone_list.sql.

select
  to_regclass('public.phone_list_drafts') as existing_drafts_table,
  to_regclass('public.phone_list_assignments') as existing_assignments_table,
  to_regprocedure('public.save_phone_list_draft(uuid,date,text,jsonb)') as existing_save_rpc;

select
  routine_name,
  routine_type,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'save_phone_list_draft';

select version
from supabase_migrations.schema_migrations
where version = '202607240001';
