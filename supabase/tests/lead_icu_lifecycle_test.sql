-- Synthetic local identities from the standard local seed; all changes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();
update public.department_memberships set role = 'lead'
where profile_id = '40000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select ok(public.user_can_manage_icu_lifecycle('30000000-0000-0000-0000-000000000002'), 'Lead has lifecycle access');
select ok(not public.user_can_manage_icu_patients('30000000-0000-0000-0000-000000000002'), 'Lead has no general editing capability');
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002', 'add',
  '{"bed":"TEST-LEAD","device_type":"vent","vent_mode":"apvcmv","fio2":40,"notes":"Shared note","is_sbt":true,"is_active":false}',
  '{"device":"Vent - APVCMV","created_by_name":"Forged"}')$$, 'Lead adds through shared atomic lifecycle');
select ok((select is_active and not is_sbt and notes = 'Shared note' from public.icu_patients where bed = 'TEST-LEAD'), 'Shared record stores note and rejects caller-controlled status/inactivity');
select is((select count(*)::int from public.icu_patient_events e join public.icu_patients p on p.id=e.icu_patient_id where p.bed='TEST-LEAD' and event_type='added'), 1, 'Add creates exactly one history event');
select ok((select e.created_by_staff_profile_id = public.current_staff_profile_id(p.department_id) and e.created_by_name <> 'Forged'
  from public.icu_patient_events e join public.icu_patients p on p.id=e.icu_patient_id where p.bed='TEST-LEAD'), 'Audit actor comes from authenticated identity');

select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000003','add','{"bed":"TEST-CROSS","device_type":"hfnc"}','{}')$$,
  '42501','Not authorized to manage devices in this department.','Cross-department add is denied');
select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','update','{}','{}')$$,
  '22023','Only add and discontinue are supported.','RPC cannot update settings or status');
select throws_ok($$insert into public.icu_patients(department_id,bed,device_type) values('30000000-0000-0000-0000-000000000002','TEST-DIRECT','hfnc')$$,
  '42501', null, 'Lead cannot bypass lifecycle with a direct insert');
with changed as (update public.icu_patients set notes='Unauthorized' where bed='TEST-LEAD' returning id) select is((select count(*)::int from changed), 0, 'RLS prevents direct settings/notes update');
select throws_ok($$select public.set_icu_vent_status((select id from public.icu_patients where bed='TEST-LEAD'),'critical',true,'{}')$$,
  'P0002','icu_vent_not_found_or_not_authorized','Lead cannot use full ICU status RPC');
select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','discontinue',
  '{"discontinued_at":"2026-09-22T16:30:00Z"}','{}',id,updated_at) from public.icu_patients where bed='TEST-LEAD'$$,
  '22023','Select a ventilator outcome.','Vent requires an outcome');
select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','discontinue',
  '{"discontinued_at":"2026-09-22T16:30:00Z","ventilator_outcome":"invented"}','{}',id,updated_at) from public.icu_patients where bed='TEST-LEAD'$$,
  '23514', null, 'Existing outcome constraint rejects invented values');
select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','discontinue',
  '{"discontinued_at":"2026-09-22T16:30:00Z","ventilator_outcome":"extubation"}','{}',id,updated_at - interval '1 second') from public.icu_patients where bed='TEST-LEAD'$$,
  '40001','Device changed. Refresh and review before discontinuing.','Stale record cannot be discontinued');
select ok((select is_active from public.icu_patients where bed='TEST-LEAD'), 'Failed discontinue leaves record active');
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','discontinue',
  '{"discontinued_at":"2026-09-22T16:30:00Z","ventilator_outcome":"extubation","notes":"Unauthorized"}',
  '{"ventilatorOutcome":"Extubation"}',id,updated_at) from public.icu_patients where bed='TEST-LEAD'$$, 'Lead discontinues Vent with existing outcome');
select ok((select not is_active and ventilator_outcome='extubation' and notes='Shared note' and fio2=40 and discontinued_at='2026-09-22T16:30:00Z'::timestamptz
  from public.icu_patients where bed='TEST-LEAD'), 'Discontinue preserves row and settings, stores outcome and chosen time');
select is((select count(*)::int from public.icu_patient_events e join public.icu_patients p on p.id=e.icu_patient_id where p.bed='TEST-LEAD'), 2, 'Add and discontinue history remain on same record');
select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','discontinue',
  '{"discontinued_at":"2026-09-22T16:30:00Z","ventilator_outcome":"extubation"}','{}',id,updated_at) from public.icu_patients where bed='TEST-LEAD'$$,
  'P0002','Active device not found.','Repeated discontinue cannot create duplicate history');
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add','{"bed":"TEST-LEAD","device_type":"bipap","ipap":12,"epap":6}','{}')$$,
  'Discontinued room can receive a new device while preserving old record');
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','discontinue',
  '{"discontinued_at":"2026-09-22T17:00:00Z"}','{}',id,updated_at) from public.icu_patients where bed='TEST-LEAD' and is_active$$,
  'Non-Vent discontinues without outcome');

-- Force a history failure and prove the record write rolls back too.
reset role;
create function pg_temp.reject_test_event() returns trigger language plpgsql as $$begin
  if new.event_data->>'bed' = 'TEST-ROLLBACK' then raise exception 'test audit failure'; end if;
  return new;
end;$$;
create trigger test_reject_event before insert on public.icu_patient_events for each row execute function pg_temp.reject_test_event();
set local role authenticated;
select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add','{"bed":"TEST-ROLLBACK","device_type":"hfnc"}','{}')$$,
  'P0001','test audit failure','Audit failure rejects entire add');
select is((select count(*)::int from public.icu_patients where bed='TEST-ROLLBACK'), 0, 'No partial record remains after audit failure');

reset role;
update public.department_memberships set role='staff' where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add','{"bed":"TEST-STAFF","device_type":"hfnc"}','{}')$$,
  '42501','Not authorized to manage devices in this department.','Ordinary Staff cannot manage ICU lifecycle');

reset role;
update public.staff_profiles set operations_role='director' where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select ok(public.user_can_view_icu_patients('30000000-0000-0000-0000-000000000002'), 'Director retains read access');
select ok(not public.user_can_manage_icu_lifecycle('30000000-0000-0000-0000-000000000002'), 'Director does not acquire lifecycle writes');
reset role;
update public.staff_profiles set operations_role='icu_command_center' where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select ok(public.user_can_manage_icu_patients('30000000-0000-0000-0000-000000000002'), 'ICU Command Center retains full edit capability');
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add','{"bed":"TEST-ICU","device_type":"cpap","cpap":8}','{}')$$,
  'ICU Command Center uses same lifecycle action');

select * from finish();
rollback;
