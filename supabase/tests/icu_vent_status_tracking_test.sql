begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(11);

insert into public.icu_patients (
  id,
  department_id,
  bed,
  device_type,
  vent_mode,
  is_active
) values (
  '91000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'C223',
  'vent',
  'apvcmv',
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.set_icu_vent_status(
    '91000000-0000-0000-0000-000000000001',
    'sbt',
    true,
    '{"device":"Vent - APVCMV"}'::jsonb
  )$$,
  'an authorized ICU manager can atomically mark SBT active'
);

select is(
  (select is_sbt from public.icu_patients where id = '91000000-0000-0000-0000-000000000001'),
  true,
  'SBT remains persisted on the Vent row'
);

select is(
  (select event_summary from public.icu_patient_events
   where icu_patient_id = '91000000-0000-0000-0000-000000000001'
     and event_type = 'sbt_status_updated'),
  'SBT marked active',
  'SBT audit wording is operational rather than a clinical start time'
);

select is(
  (select created_by_name from public.icu_patient_events
   where icu_patient_id = '91000000-0000-0000-0000-000000000001'
     and event_type = 'sbt_status_updated'),
  'Local Administrator',
  'status history records the authenticated display name'
);

select lives_ok(
  $$select public.note_icu_vent_shift_event(
    '91000000-0000-0000-0000-000000000001',
    'ct',
    '{"device":"Vent - APVCMV"}'::jsonb
  )$$,
  'CT can be noted for the current hospital shift'
);

select lives_ok(
  $$select public.note_icu_vent_shift_event(
    '91000000-0000-0000-0000-000000000001',
    'ct',
    '{"device":"Vent - APVCMV"}'::jsonb
  )$$,
  'a repeated CT tap is idempotent'
);

select is(
  (select count(*)::integer from public.icu_patient_events
   where icu_patient_id = '91000000-0000-0000-0000-000000000001'
     and event_type = 'ct_noted'),
  1,
  'repeated taps create only one CT history row in the same shift'
);

select is(
  (select event_summary from public.icu_patient_events
   where icu_patient_id = '91000000-0000-0000-0000-000000000001'
     and event_type = 'ct_noted'),
  'CT noted this shift',
  'CT history uses the required board-update wording'
);

select ok(
  (select operational_shift_date is not null and operational_shift_type in ('day', 'night')
   from public.icu_patient_events
   where icu_patient_id = '91000000-0000-0000-0000-000000000001'
     and event_type = 'ct_noted'),
  'shift events retain a permanent operational date and shift identifier'
);

select is(
  (select is_critical_vent from public.icu_patients where id = '91000000-0000-0000-0000-000000000001'),
  false,
  'the existing Critical value is preserved independently from SBT and CT'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.set_icu_vent_status(
    '91000000-0000-0000-0000-000000000001',
    'critical',
    true,
    '{}'::jsonb
  )$$,
  'P0002',
  'icu_vent_not_found_or_not_authorized',
  'regular Staff cannot change Vent statuses'
);

select * from finish();
rollback;
