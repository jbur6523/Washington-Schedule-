begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(27);

insert into public.icu_patients(id,department_id,bed,device_type,vent_mode,ps,peep,fio2,is_active)
values('92000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','C223','vent','spont',8,5,30,true);

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
create function pg_temp.rounding(action text, payload jsonb) returns jsonb language sql as $$
  select public.record_icu_rounding_action(id, action, payload, updated_at) from public.icu_patients
  where id = '92000000-0000-0000-0000-000000000001';
$$;
select is((select is_sbt from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),false,'Pressure Support alone does not mean SBT');
select lives_ok($$select pg_temp.rounding('sbt','{"result":"Pass"}')$$,'explicit Pass is saved');
select is((select is_sbt from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),true,'Pass highlights while on Pressure Support');
select lives_ok($$select pg_temp.rounding('sbt','{"result":"Pass"}')$$,'repeat Pass during continuous PS is harmless');
select is((select count(*)::int from public.icu_patient_events where icu_patient_id='92000000-0000-0000-0000-000000000001'),1,'continuous PS does not require or create repeated events');
select is((select vent_mode || ':' || ps || ':' || fio2 from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'spont:8:30','SBT does not change settings');
select is((select rounding_data->'previousSettings' from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),null::jsonb,'SBT does not create previous settings');
select throws_ok($$select pg_temp.rounding('sbt','{"result":"Fail","reason":"Other","other":""}')$$,'22023','Enter a short failure reason','Other needs a reason');
select lives_ok($$select pg_temp.rounding('sbt','{"result":"Fail","reason":"Poor neuro status"}')$$,'failure is saved');
select is((select is_sbt from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),false,'failure clears highlight');
select is((select rounding_data#>>'{sbt,reason}' from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'Poor neuro status','failure reason persists');
select pg_temp.rounding('sbt','{"result":"Pass"}');
update public.icu_patients set vent_mode='apvcmv' where id='92000000-0000-0000-0000-000000000001';
update public.icu_patients set vent_mode='spont' where id='92000000-0000-0000-0000-000000000001';
select is((select is_sbt from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),false,'leaving and returning to PS does not restart SBT');
select is((select rounding_data#>>'{previousSettings,vent_mode}' from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'apvcmv','actual settings changes preserve the previous settings');
select lives_ok($$select pg_temp.rounding('critical','{"flolan":true,"proned":true,"other":"Secretion burden"}')$$,'multiple Critical options persist together');
select pg_temp.rounding('note','{"notes":"Test rounding note"}');
select ok((select is_critical_vent and is_flolan and is_prone from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'Critical remains active after note updates');
select is((select rounding_data#>>'{previousSettings,vent_mode}' from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'apvcmv','quick actions leave previous settings intact');
select pg_temp.rounding('critical','{"flolan":false,"proned":false,"other":""}');
select is((select is_critical_vent from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),false,'Critical clears manually');
select pg_temp.rounding('procedure','{"name":"CT"}');
select pg_temp.rounding('procedure','{"name":"CT"}');
select is((select count(*)::int from public.icu_patient_events where icu_patient_id='92000000-0000-0000-0000-000000000001' and event_data->>'action'='procedure_recorded'),2,'separate procedures each retain an event');
select lives_ok($$select pg_temp.rounding('procedure','{"name":"Trach","trachType":"Shiley","size":"6","xlt":true,"date":""}')$$,'trach date is optional');
select is((select airway_type || ':' || trach_type || ':' || airway_size || ':' || trach_xlt from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'trach:shiley:6:true','trach airway details persist');
select is((select vent_mode || ':' || ps || ':' || fio2 from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'spont:8:30','procedure does not alter ventilator settings');
select throws_ok($$select public.record_icu_rounding_action('92000000-0000-0000-0000-000000000001','note','{"notes":"stale"}','2000-01-01')$$,'40001','This patient was updated. Refresh the card and try again.','stale saves are rejected');
select ok((select bool_and(created_by_name='Local Administrator' and event_data ? 'record' and event_data ? 'previousRecord') from public.icu_patient_events where icu_patient_id='92000000-0000-0000-0000-000000000001'),'server-authored audit includes both records and actor');
reset role;
create function pg_temp.reject_test_history() returns trigger language plpgsql as $$
begin
  if new.event_data->>'notes' = 'force audit failure' then raise exception 'test audit failure'; end if;
  return new;
end;
$$;
create trigger reject_test_history before insert on public.icu_patient_events for each row execute function pg_temp.reject_test_history();
set local role authenticated;
select throws_ok($$select pg_temp.rounding('note','{"notes":"force audit failure"}')$$,'P0001','test audit failure','audit failure rejects the whole action');
select is((select notes from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'Test rounding note','failed audit rolls back the patient update');
select is(has_function_privilege('anon','public.record_icu_rounding_action(uuid,text,jsonb,timestamptz)','execute'),false,'anonymous users cannot invoke rounding actions');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000099',true);
select throws_ok($$select public.record_icu_rounding_action('92000000-0000-0000-0000-000000000001','note','{"notes":"unauthorized"}',now())$$,'42501','Patient unavailable or not authorized','unauthorized caller cannot update or audit');
select * from finish();
rollback;
