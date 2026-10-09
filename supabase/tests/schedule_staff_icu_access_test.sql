-- Synthetic local seed identities only; all changes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();
update public.department_memberships set role='staff'
where profile_id='40000000-0000-0000-0000-000000000002';
update public.staff_profiles set operations_role='none', is_active=true
where profile_id='40000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select ok(public.user_can_view_icu_patients('30000000-0000-0000-0000-000000000002'),'Regular Schedule staff can view their department ICU');
select ok(public.user_can_manage_icu_patients('30000000-0000-0000-0000-000000000002'),'Regular Schedule staff can edit their department ICU');
select lives_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add',
  '{"bed":"TEST-SCHEDULE-STAFF","device_type":"vent","vent_mode":"apvcmv","fio2":40}',
  '{"created_by_name":"Forged"}')$$,'Staff can add through the existing ICU lifecycle');
select is((select count(*)::int from public.icu_patients where bed='TEST-SCHEDULE-STAFF'),1,'Staff can read the new ICU record');
select lives_ok($$update public.icu_patients set fio2=45 where bed='TEST-SCHEDULE-STAFF'$$,'Staff can update ICU settings');
select is((select fio2::int from public.icu_patients where bed='TEST-SCHEDULE-STAFF'),45,'Settings update persists');
select lives_ok($$select public.record_icu_rounding_action(id,'note','{"notes":"Synthetic staff test"}',updated_at)
  from public.icu_patients where bed='TEST-SCHEDULE-STAFF'$$,'Staff can save rounding notes');
select lives_ok($$select public.manage_icu_modality(id,'hfnc','{"flow":30,"fio2":40}','save',updated_at)
  from public.icu_patients where bed='TEST-SCHEDULE-STAFF'$$,'Staff can save ICU modalities');
select ok((select bool_and(created_by_staff_profile_id=public.current_staff_profile_id(department_id) and created_by_name<>'Forged')
  from public.icu_patient_events where icu_patient_id in (select id from public.icu_patients where bed='TEST-SCHEDULE-STAFF')),
  'ICU history attributes updates to the signed-in employee');

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
select ok(not public.user_can_manage_icu_patients('30000000-0000-0000-0000-000000000002'),'Other department cannot edit');
select is((select count(*)::int from public.icu_patients where bed='TEST-SCHEDULE-STAFF'),0,'Other department cannot read records');
select is((select count(*)::int from public.icu_patient_events where event_data->>'bed'='TEST-SCHEDULE-STAFF'),0,'Other department cannot read history');
select throws_ok($$insert into public.icu_patients(department_id,bed,device_type)
  values('30000000-0000-0000-0000-000000000002','TEST-CROSS-DEPT','hfnc')$$,'42501',null,'Cross-department insert is blocked by RLS');
with changed as (update public.icu_patients set fio2=99 where bed='TEST-SCHEDULE-STAFF' returning id)
select is((select count(*)::int from changed),0,'Cross-department update is blocked by RLS');

reset role;
update public.staff_profiles set operations_role='aide'
where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select ok(not public.user_can_view_icu_patients('30000000-0000-0000-0000-000000000002'),'Aides cannot view ICU');
select ok(not public.user_can_manage_icu_patients('30000000-0000-0000-0000-000000000002'),'Aides cannot edit ICU');
select ok(not public.user_can_manage_icu_lifecycle('30000000-0000-0000-0000-000000000002'),'Aides cannot manage ICU lifecycle');
select is((select count(*)::int from public.icu_patients where bed='TEST-SCHEDULE-STAFF'),0,'RLS hides ICU records from Aides');
select is((select count(*)::int from public.icu_patient_events),0,'RLS hides ICU history from Aides');
select is((select count(*)::int from public.get_current_icu_snapshot_counts('30000000-0000-0000-0000-000000000002')),0,'Aides cannot bypass ICU reads through summary RPC');
select throws_ok($$insert into public.icu_patients(department_id,bed,device_type)
  values('30000000-0000-0000-0000-000000000002','TEST-AIDE','hfnc')$$,'42501',null,'RLS blocks direct Aide inserts');
with changed as (update public.icu_patients set fio2=99 where bed='TEST-SCHEDULE-STAFF' returning id)
select is((select count(*)::int from changed),0,'RLS blocks Aide updates');
select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add','{"bed":"TEST-AIDE","device_type":"hfnc"}','{}')$$,
  '42501','Not authorized to manage devices in this department.','Lifecycle RPC rejects Aides');
reset role;
update public.department_memberships set role='admin' where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select ok(not public.user_can_manage_icu_lifecycle('30000000-0000-0000-0000-000000000002'),'Admin membership cannot bypass Aide restriction');
select ok(not public.user_can_view_icu_patients('30000000-0000-0000-0000-000000000002'),'Admin Aides still cannot read ICU');
reset role;
update public.department_memberships set role='lead' where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select ok(not public.user_can_manage_icu_lifecycle('30000000-0000-0000-0000-000000000002'),'Lead membership cannot bypass Aide restriction');
reset role;
update public.staff_profiles set operations_role='none' where profile_id='40000000-0000-0000-0000-000000000002';
update public.department_memberships set role='staff' where profile_id='40000000-0000-0000-0000-000000000002';
update public.staff_profiles set is_active=false where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select ok(not public.user_can_manage_icu_patients('30000000-0000-0000-0000-000000000002'),'Deactivation revokes editing even with an existing session');
select is((select count(*)::int from public.icu_patients where bed='TEST-SCHEDULE-STAFF'),0,'Inactive staff cannot read ICU records');
select throws_ok($$select public.manage_icu_device('30000000-0000-0000-0000-000000000002','add','{"bed":"TEST-INACTIVE","device_type":"hfnc"}','{}')$$,
  '42501','Not authorized to manage devices in this department.','Inactive staff cannot invoke lifecycle writes');

reset role;
update public.staff_profiles set is_active=true where profile_id='40000000-0000-0000-0000-000000000002';
delete from public.department_memberships where profile_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select ok(not public.user_can_view_icu_patients('30000000-0000-0000-0000-000000000002'),'Staff without membership cannot read ICU');
select ok(not public.user_can_manage_icu_patients('30000000-0000-0000-0000-000000000002'),'Staff without membership cannot edit ICU');
select set_config('request.jwt.claim.sub','',true);
select ok(not public.user_can_manage_icu_patients('30000000-0000-0000-0000-000000000002'),'Missing authenticated identity cannot edit ICU');
select ok(not has_function_privilege('anon','public.user_can_manage_icu_patients(uuid)','execute'),'Anonymous callers cannot invoke edit permission helper');
select ok(not has_function_privilege('anon','public.user_can_view_icu_patients(uuid)','execute'),'Anonymous callers cannot invoke view permission helper');
select * from finish();
rollback;
