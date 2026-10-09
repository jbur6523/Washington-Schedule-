-- Synthetic local seed identities only; all test changes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();
update public.department_memberships set role = 'lead'
where profile_id = '40000000-0000-0000-0000-000000000002';
update public.staff_profiles set operations_role = 'none'
where profile_id = '40000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add',
  jsonb_build_object('bed', bed, 'device_type','vent','vent_mode','apvcmv','notes','Existing note'), '{}')
  from unnest(array['OTHER-LEAD-COMMENT','OTHER-LEAD-BLANK']) bed$$, 'Lead adds test ventilators');
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','discontinue',
  '{"discontinued_at":"2026-10-09T19:00:00Z","ventilator_outcome":"other_unknown"}',
  jsonb_build_object('ventilatorOutcome','Other/Unknown','ventilatorOutcomeComment',
    case when bed like '%COMMENT' then 'Outcome pending clarification' else null end), id, updated_at)
  from public.icu_patients where bed like 'OTHER-LEAD-%'$$, 'Lead saves Other/Unknown with or without comment');
select is((select count(*)::int from public.icu_patients where bed like 'OTHER-LEAD-%'
  and not is_active and ventilator_outcome='other_unknown' and notes='Existing note'), 2,
  'Lead discontinuation preserves notes and stores outcome on both rows');
select is((select event_data->>'ventilatorOutcomeComment' from public.icu_patient_events
  where event_data->>'bed'='OTHER-LEAD-COMMENT' and event_type='discontinued'),
  'Outcome pending clarification', 'Lead comment persists in shared history');
select is((select event_data->>'ventilatorOutcomeComment' from public.icu_patient_events
  where event_data->>'bed'='OTHER-LEAD-BLANK' and event_type='discontinued'),
  null::text, 'Lead can leave the comment blank');

reset role;
update public.department_memberships set role = 'staff'
where profile_id = '40000000-0000-0000-0000-000000000002';
update public.staff_profiles set operations_role = 'icu_command_center'
where profile_id = '40000000-0000-0000-0000-000000000002';
set local role authenticated;
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add',
  jsonb_build_object('bed', bed, 'device_type','vent','vent_mode','apvcmv','notes','Existing note'), '{}')
  from unnest(array['OTHER-ICU-COMMENT','OTHER-ICU-BLANK']) bed$$, 'ICU adds test ventilators');
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','discontinue',
  '{"discontinued_at":"2026-10-09T19:00:00Z","ventilator_outcome":"other_unknown"}',
  jsonb_build_object('ventilatorOutcome','Other/Unknown','ventilatorOutcomeComment',
    case when bed like '%COMMENT' then 'Outcome pending clarification' else null end), id, updated_at)
  from public.icu_patients where bed like 'OTHER-ICU-%'$$, 'ICU saves Other/Unknown with or without comment');
select is((select count(*)::int from public.icu_patients where bed like 'OTHER-ICU-%'
  and not is_active and ventilator_outcome='other_unknown' and notes='Existing note'), 2,
  'ICU discontinuation preserves notes and stores outcome on both rows');
select is((select event_data->>'ventilatorOutcomeComment' from public.icu_patient_events
  where event_data->>'bed'='OTHER-ICU-COMMENT' and event_type='discontinued'),
  'Outcome pending clarification', 'ICU comment persists in shared history');
select is((select event_data->>'ventilatorOutcomeComment' from public.icu_patient_events
  where event_data->>'bed'='OTHER-ICU-BLANK' and event_type='discontinued'),
  null::text, 'ICU can leave the comment blank');
select is((select count(*)::int from public.icu_patient_events where event_data->>'bed' like 'OTHER-%'
  and event_type='discontinued' and event_data->>'ventilatorOutcomeValue'='other_unknown'), 4,
  'Each discontinuation has exactly one event with its canonical outcome');

select * from finish();
rollback;
