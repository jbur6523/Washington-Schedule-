begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select plan(8);
insert into public.icu_patients(id,department_id,bed,device_type,flow,fio2,is_active)
values('92000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000002','C223','hfnc',40,50,true);
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
create function pg_temp.pcmv_modality(device text,settings jsonb,action text) returns jsonb language sql as $$
select public.manage_icu_modality(id,device,settings,action,updated_at) from public.icu_patients where id='92000000-0000-0000-0000-000000000004';
$$;
select lives_ok($$select pg_temp.pcmv_modality('vent','{"vent_mode":"pcmv","pressure_control":18,"rate":14,"peep":5,"fio2":30,"airway_type":"ett"}','save')$$,'PCMV profile saves');
select lives_ok($$select pg_temp.pcmv_modality('vent','{}','switch')$$,'PCMV activates');
select is((select pressure_control from public.icu_patients where id='92000000-0000-0000-0000-000000000004'),18::numeric,'Pressure control restored');
update public.icu_patients set pressure_control=20 where id='92000000-0000-0000-0000-000000000004';
select is((select rounding_data->'previousSettings'->>'pressure_control' from public.icu_patients where id='92000000-0000-0000-0000-000000000004'),'18','Previous pressure retained');
select lives_ok($$select pg_temp.pcmv_modality('cpap','{"cpap":8}','save')$$,'Alternate modality saved');
select lives_ok($$select pg_temp.pcmv_modality('cpap','{}','switch')$$,'Alternate modality activated');
select is((select pressure_control from public.icu_patients where id='92000000-0000-0000-0000-000000000004'),null::numeric,'Pressure cleared when leaving vent');
select throws_ok($$select pg_temp.pcmv_modality('vent','{"vent_mode":"pcmv","pressure_control":-1}','save')$$,'22023','Invalid setting value','Negative pressure rejected');
select * from finish();
rollback;
