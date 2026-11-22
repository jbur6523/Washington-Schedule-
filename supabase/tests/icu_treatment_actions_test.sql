begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(9);

insert into public.icu_patients(id,department_id,bed,device_type,vent_mode,ps,peep,fio2,is_active)
values('92000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','C223','vent','spont',8,5,30,true);

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
create function pg_temp.rounding(action text, payload jsonb) returns jsonb language sql as $$
  select public.record_icu_rounding_action(id, action, payload, updated_at) from public.icu_patients
  where id = '92000000-0000-0000-0000-000000000001';
$$;

select throws_ok($$select pg_temp.rounding('treatment','{"name":"Nebulizer"}')$$,'22023','Select a treatment and frequency','frequency required');
select throws_ok($$select pg_temp.rounding('treatment','{"name":"Other","frequency":"Q4"}')$$,'22023','Select a treatment and frequency','unknown treatment rejected');
select lives_ok($$select pg_temp.rounding('treatment','{"name":"Nebulizer","frequency":"Q4WA"}')$$,'treatment saves');
select is((select rounding_data#>>'{treatment,frequency}' from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'Q4WA','frequency persists');
select is((select count(*)::int from public.icu_patient_events where icu_patient_id='92000000-0000-0000-0000-000000000001' and event_summary='Treatment: Nebulizer � Q4WA'),1,'history persists atomically');
select is((select vent_mode from public.icu_patients where id='92000000-0000-0000-0000-000000000001'),'spont','treatment leaves settings alone');
update public.icu_patients set device_type='hfnc',vent_mode=null where id='92000000-0000-0000-0000-000000000001';
update public.icu_patients set rounding_data=rounding_data #- '{modalities,vent}' where id='92000000-0000-0000-0000-000000000001';
select throws_ok($$select pg_temp.rounding('critical','{"flolan":true,"proned":false}')$$,'22023','Critical Vent requires a ventilator modality','previous vent settings do not qualify');
update public.icu_patients set rounding_data=jsonb_set(rounding_data,'{modalities}','{"vent":{"vent_mode":"apvcmv"}}') where id='92000000-0000-0000-0000-000000000001';
select lives_ok($$select pg_temp.rounding('critical','{"flolan":true,"proned":false}')$$,'additional vent qualifies');
select lives_ok($$select pg_temp.rounding('treatment','{"name":"PEP","frequency":"BID"}')$$,'treatment also saves off vent');
select * from finish();
rollback;

