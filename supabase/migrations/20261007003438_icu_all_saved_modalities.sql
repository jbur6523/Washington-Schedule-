
-- Store only modality settings; patient identity, notes, flags and lifecycle stay independent.
create or replace function public.icu_modality_profile(device text, source jsonb)
returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$
select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(source)
where key=any(case device
 when 'vent' then array['vent_mode','airway_type','airway_size','airway_at','airway_location','trach_type','trach_xlt','rate','tidal_volume','peep','fio2','ps','t_high','t_low','p_high','p_low','percent_min_vol']
 when 'bipap' then array['ipap','epap','rate','fio2']
 when 'cpap' then array['cpap']
 when 'hfnc' then array['flow','fio2']
 when 'cool_aerosol' then array['flow','fio2'] else array[]::text[] end);
$$;
revoke all on function public.icu_modality_profile(text,jsonb) from public, anon;
grant execute on function public.icu_modality_profile(text,jsonb) to authenticated;

create or replace function public.remember_icu_modalities()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare profiles jsonb; item jsonb;
begin
 profiles:=coalesce(new.rounding_data->'modalities','{}'::jsonb);
 foreach item in array array[to_jsonb(old),to_jsonb(new)] loop
  profiles:=jsonb_set(profiles,array[item->>'device_type'],public.icu_modality_profile(item->>'device_type',item));
 end loop;
 new.rounding_data:=jsonb_set(new.rounding_data,'{modalities}',profiles);
 return new;
end;
$$;

create or replace function public.manage_icu_modality(target_patient_id uuid,target_modality text,target_settings jsonb,target_action text,expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
 patient public.icu_patients%rowtype; saved public.icu_patients%rowtype; candidate public.icu_patients%rowtype;
 actor_id uuid; actor_name text; settings jsonb; snapshot jsonb; field text; value jsonb; summary text;
begin
 if target_modality is null or target_modality not in ('vent','bipap','cpap','hfnc','cool_aerosol')
 or target_action is null or target_action not in ('save','switch','discontinue') then
  raise exception 'Invalid modality action' using errcode='22023';
 end if;
 select p.* into patient from public.icu_patients p where p.id=target_patient_id and p.is_active
 and public.user_can_manage_icu_patients(p.department_id) for update;
 if not found then raise exception 'Patient unavailable or not authorized' using errcode='42501'; end if;
 if expected_updated_at is null or patient.updated_at is distinct from expected_updated_at then
  raise exception 'This patient was updated. Refresh the card and try again.' using errcode='40001';
 end if;
 if patient.device_type=target_modality then raise exception 'Use Update or Discontinue for current support' using errcode='22023'; end if;
 actor_id:=public.current_staff_profile_id(patient.department_id);
 select display_name into actor_name from public.profiles where id=public.current_profile_id();
 if actor_id is null or actor_name is null then raise exception 'Active ICU actor required' using errcode='42501'; end if;
 snapshot:=patient.rounding_data;
 if target_action in ('switch','discontinue') then target_settings:=snapshot #> array['modalities',target_modality]; end if;
 if target_settings is null or jsonb_typeof(target_settings)<>'object' then
  raise exception 'Save settings for this modality first' using errcode='22023';
 end if;
 settings:=public.icu_modality_profile(target_modality,target_settings);
 if target_action='discontinue' then
  snapshot:=jsonb_set(snapshot,'{modalities}',(snapshot->'modalities')-target_modality);
 else
  for field,value in select key,val from jsonb_each(settings) as t(key,val) loop
   if field=any(array['rate','tidal_volume','peep','fio2','ps','t_high','t_low','p_high','p_low','percent_min_vol','ipap','epap','cpap','flow']) and value<>'null'::jsonb then
    if jsonb_typeof(value)<>'number' then raise exception 'Settings must be non-negative numbers' using errcode='22023'; end if;
    if (value::text)::numeric<0 or (field='fio2' and (value::text)::numeric>100) then raise exception 'Invalid setting value' using errcode='22023'; end if;
   end if;
  end loop;
  if target_modality='vent' then
   if coalesce(settings->>'vent_mode','') not in ('apvcmv','scmv','spont','asv','pcmv','aprv') then raise exception 'Select a vent mode' using errcode='22023'; end if;
   if coalesce(settings->>'airway_type','ett') not in ('ett','trach') then raise exception 'Invalid airway type' using errcode='22023'; end if;
   if settings->>'airway_type'='trach' then
    if coalesce(settings->>'trach_type','') not in ('shiley','portex','other') or coalesce(settings->>'airway_size','') not in ('4','5','6','7','8') then raise exception 'Select trach type and size' using errcode='22023'; end if;
    settings:=settings || '{"airway_at":null,"airway_location":null}'::jsonb;
   else
    settings:=settings || '{"trach_type":null,"trach_xlt":false}'::jsonb;
   end if;
   if settings->>'airway_location' is not null and settings->>'airway_location' not in ('teeth','gum','nare') then raise exception 'Invalid airway location' using errcode='22023'; end if;
   if settings->>'airway_at' is not null and ((settings->>'airway_at') !~ '^[0-9]+([.][0-9]+)?$') then raise exception 'Invalid airway depth' using errcode='22023'; end if;
   if settings->>'airway_size' is not null and ((settings->>'airway_size') !~ '^[0-9]+([.][0-9]+)?$') then raise exception 'Invalid airway size' using errcode='22023'; end if;
   if settings->'trach_xlt' is not null and jsonb_typeof(settings->'trach_xlt')<>'boolean' then raise exception 'Invalid XLT setting' using errcode='22023'; end if;
  end if;
  snapshot:=jsonb_set(snapshot,'{modalities}',coalesce(snapshot->'modalities','{}'::jsonb)||jsonb_build_object(target_modality,settings));
 end if;
 if target_action='switch' then
  candidate:=jsonb_populate_record(null::public.icu_patients,settings);
  update public.icu_patients set rounding_data=snapshot,device_type=target_modality,
  vent_mode=candidate.vent_mode,
  airway_type=candidate.airway_type,
  airway_size=candidate.airway_size,
  airway_at=candidate.airway_at,
  airway_location=candidate.airway_location,
  trach_type=candidate.trach_type,
  trach_xlt=coalesce(candidate.trach_xlt,false),
  rate=candidate.rate,
  tidal_volume=candidate.tidal_volume,
  peep=candidate.peep,
  fio2=candidate.fio2,
  ps=candidate.ps,
  t_high=candidate.t_high,
  t_low=candidate.t_low,
  p_high=candidate.p_high,
  p_low=candidate.p_low,
  percent_min_vol=candidate.percent_min_vol,
  ipap=candidate.ipap,
  epap=candidate.epap,
  cpap=candidate.cpap,
  flow=candidate.flow,
  is_standby=false,updated_by_staff_profile_id=actor_id where id=patient.id returning * into saved;
 else
  update public.icu_patients set rounding_data=snapshot,updated_by_staff_profile_id=actor_id where id=patient.id returning * into saved;
 end if;
 summary:=case target_action when 'switch' then 'Switched to ' when 'discontinue' then 'Discontinued saved modality: ' else 'Saved additional modality: ' end ||
 case target_modality when 'vent' then 'Vent' when 'bipap' then 'BiPAP' when 'cpap' then 'CPAP' when 'hfnc' then 'HFNC' else 'Cool Aerosol' end;
 insert into public.icu_patient_events(department_id,icu_patient_id,event_type,event_time,event_summary,event_data,created_by_staff_profile_id,created_by_name)
 values(saved.department_id,saved.id,'updated',clock_timestamp(),summary,
 jsonb_build_object('action',case target_action when 'switch' then 'modality_switched' when 'discontinue' then 'modality_discontinued' else 'modality_saved' end,
 'modality',target_modality,'settings',settings,'record',to_jsonb(saved),'previousRecord',to_jsonb(patient),'bed',saved.bed),actor_id,actor_name);
 return to_jsonb(saved);
end;
$$;
revoke all on function public.manage_icu_modality(uuid,text,jsonb,text,timestamptz) from public,anon;
grant execute on function public.manage_icu_modality(uuid,text,jsonb,text,timestamptz) to authenticated;

-- Older open browser tabs continue to use the same secured implementation.
create or replace function public.save_icu_modality(target_patient_id uuid,target_modality text,target_settings jsonb,activate boolean,expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
select public.manage_icu_modality(target_patient_id,target_modality,target_settings,case when activate then 'switch' when not activate then 'save' end,expected_updated_at);
$$;

