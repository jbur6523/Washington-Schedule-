-- Synthetic local seed identities only; all test changes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();
update public.department_memberships set role = 'lead'
where profile_id = '40000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);

select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add',
  '{"bed":"TEST-TRACH","device_type":"vent","vent_mode":"apvcmv","airway_type":"trach","airway_size":"6","trach_type":"shiley","trach_xlt":true}',
  '{"airway":"Trach 6 Shiley XLT"}')$$, 'Lead adds a trach through shared lifecycle');
select ok((select airway_type='trach' and airway_size='6' and trach_type='shiley' and trach_xlt and airway_at is null and airway_location is null
  from public.icu_patients where bed='TEST-TRACH'), 'Trach details persist on the shared ICU row');
select ok((select event_data->'record'->>'trach_type'='shiley' and (event_data->'record'->>'trach_xlt')::boolean
  from public.icu_patient_events where event_data->>'bed'='TEST-TRACH'), 'Canonical add history includes trach details');

select lives_ok(format($q$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add',%L::jsonb,'{}')$q$,
  jsonb_build_object('bed','TEST-T-'||size,'device_type','vent','vent_mode','apvcmv','airway_type','trach','airway_size',size,'trach_type','portex')),
  'Trach size '||size||' is accepted without XLT') from unnest(array['4','5','7','8']) size;

select throws_ok(format($q$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add',%L::jsonb,'{}')$q$,
  '{"bed":"TEST-BAD","device_type":"vent","vent_mode":"apvcmv","airway_type":"trach","airway_size":"6","trach_type":"shiley"}'::jsonb || invalid),
  '23514', null, description)
from (values
  ('{"airway_size":"3"}'::jsonb, 'Size below 4 is rejected'),
  ('{"airway_size":"9"}'::jsonb, 'Size above 8 is rejected'),
  ('{"airway_size":"6.5"}'::jsonb, 'ETT half size is rejected for a trach'),
  ('{"airway_size":null}'::jsonb, 'Missing trach size is rejected'),
  ('{"trach_type":null}'::jsonb, 'Missing trach type is rejected'),
  ('{"trach_type":"invalid"}'::jsonb, 'Unknown trach type is rejected'),
  ('{"airway_at":"23"}'::jsonb, 'Trach cannot store ETT depth'),
  ('{"airway_location":"teeth"}'::jsonb, 'Trach cannot store ETT location'),
  ('{"airway_type":"ett"}'::jsonb, 'ETT cannot retain trach type'),
  ('{"airway_type":null}'::jsonb, 'Legacy ETT cannot retain trach type'),
  ('{"device_type":"hfnc"}'::jsonb, 'Non-vent cannot acquire trach fields')
) cases(invalid, description);
select is((select count(*)::int from public.icu_patients where bed='TEST-BAD'),0,'Invalid airway writes create no records');

select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add',
  '{"bed":"TEST-ETT","device_type":"vent","vent_mode":"apvcmv","airway_size":"7.5","airway_at":"23","airway_location":"teeth"}','{}')$$,
  'Older clients can still add ETT with existing fields');
select ok((select airway_type='ett' and airway_at='23' and airway_location='teeth' and trach_type is null and not trach_xlt
  from public.icu_patients where bed='TEST-ETT'), 'Legacy add defaults to ETT');

reset role;
update public.staff_profiles set operations_role='icu_command_center' where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select lives_ok($$update public.icu_patients set airway_size='8', trach_type='other', trach_xlt=false where bed='TEST-TRACH'$$,
  'ICU editor can update trach details through existing edit permissions');
select ok((select airway_size='8' and trach_type='other' and not trach_xlt from public.icu_patients where bed='TEST-TRACH'),
  'Edited trach details persist');
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','discontinue',
  '{"discontinued_at":"2026-09-22T22:00:00Z","ventilator_outcome":"trached_aerosol"}','{}',id,updated_at)
  from public.icu_patients where bed='TEST-TRACH'$$, 'Trach uses existing vent outcome flow');
select ok((select not is_active and airway_type='trach' and airway_size='8' and trach_type='other' from public.icu_patients where bed='TEST-TRACH'),
  'Discontinuation preserves trach details');
select ok((select event_data->'record'->>'trach_type'='other' from public.icu_patient_events
  where event_data->>'bed'='TEST-TRACH' and event_type='discontinued'), 'Discontinued history retains canonical trach details');

select * from finish();
rollback;
