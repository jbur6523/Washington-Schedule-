-- WARNING: This permanently deletes Rental Management test data.
-- Run this manually in the Supabase SQL editor only after final deployed smoke testing.
-- This is a one-time go-live cleanup script, not a routine maintenance feature.
--
-- Deletes:
-- - rental helper/sync rows if those optional tables exist
-- - rental_events
-- - rental_records
-- - rental_equipment
--
-- Preserves:
-- - rental_vendors
-- - users, staff profiles, roles, departments, schedules, Cover/Switch, Gossip, and app settings

begin;

-- Optional future/helper tables. These guards keep the script idempotent across environments.
do $$
begin
  if to_regclass('public.rental_spreadsheet_syncs') is not null then
    execute 'delete from public.rental_spreadsheet_syncs';
  end if;

  if to_regclass('public.rental_export_syncs') is not null then
    execute 'delete from public.rental_export_syncs';
  end if;

  if to_regclass('public.rental_export_logs') is not null then
    execute 'delete from public.rental_export_logs';
  end if;

  if to_regclass('public.rental_sync_logs') is not null then
    execute 'delete from public.rental_sync_logs';
  end if;
end $$;

-- Delete dependent rows first, then records, then reusable equipment identities.
delete from public.rental_events;
delete from public.rental_records;
delete from public.rental_equipment;

commit;

-- Verification queries. Expected after wipe:
-- rental_events_count = 0
-- rental_records_count = 0
-- rental_equipment_count = 0
-- rental_vendors_count > 0
select count(*) as rental_events_count from public.rental_events;
select count(*) as rental_records_count from public.rental_records;
select count(*) as rental_equipment_count from public.rental_equipment;
select count(*) as rental_vendors_count from public.rental_vendors;
