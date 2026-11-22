-- Extubation transitions the current patient instead of ending their episode.
begin;
create or replace function private.extubate_icu_patient(
 target_patient_id uuid, target_modality text, target_settings jsonb,
 extubated_at timestamptz, expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 patient public.icu_patients%rowtype; saved public.icu_patients%rowtype; candidate public.icu_patients%rowtype;
 actor_id uuid; actor_name text; settings jsonb; snapshot jsonb; field text; value jsonb;
begin
 if auth.uid() is null then raise exception 'Not authorized.' using errcode='42501'; end if;
 select * into patient from public.icu_patients where id=target_patient_id and is_active for update;
 if not found or not public.user_can_manage_icu_lifecycle(patient.department_id) then
  raise exception 'Patient unavailable or not authorized.' using errcode='42501';
 end if;
 if expected_updated_at is distinct from patient.updated_at then
  raise exception 'Patient changed. Refresh and review before extubating.' using errcode='40001';
 end if;
 if patient.device_type <> 'vent' then raise exception 'Patient is not on a ventilator.' using errcode='22023'; end if;
 if extubated_at is null or not isfinite(extubated_at) then raise exception 'Extubation date and time are required.' using errcode='22023'; end if;
 if target_modality is null or target_modality not in ('none','bipap','cpap','hfnc','cool_aerosol','nasal_cannula','non_rebreather','venturi_mask','ozymizer')
 or jsonb_typeof(target_settings) is distinct from 'object' then raise exception 'Invalid replacement modality.' using errcode='22023'; end if;
 actor_id:=public.current_staff_profile_id(patient.department_id);
 select display_name into actor_name from public.profiles where id=public.current_profile_id();
 if actor_id is null or actor_name is null then raise exception 'Active ICU actor required.' using errcode='42501'; end if;
 settings:=public.icu_modality_profile(target_modality,target_settings);
 for field,value in select key,val from jsonb_each(settings) as t(key,val) loop
  if value <> 'null'::jsonb then
   if jsonb_typeof(value)<>'number' then raise exception 'Settings must be non-negative numbers.' using errcode='22023'; end if;
   if (value::text)::numeric<0 or (field='fio2' and (value::text)::numeric>100) then raise exception 'Invalid setting value.' using errcode='22023'; end if;
  end if;
 end loop;
 candidate:=jsonb_populate_record(null::public.icu_patients,settings);
 snapshot:=coalesce(patient.rounding_data,'{}'::jsonb);
 snapshot:=jsonb_set(snapshot,'{modalities}',coalesce(snapshot->'modalities','{}'::jsonb)-'vent'-target_modality);
 snapshot:=snapshot || jsonb_build_object('extubation',jsonb_build_object('at',extubated_at,'modality',target_modality,'settings',settings));
 update public.icu_patients set device_type=target_modality,rounding_data=snapshot,
  airway_type=null,airway_size=null,airway_at=null,airway_location=null,trach_type=null,trach_xlt=false,
  vent_mode=null,rate=candidate.rate,tidal_volume=null,pressure_control=null,peep=null,ps=null,
  t_high=null,t_low=null,p_high=null,p_low=null,percent_min_vol=null,
  ipap=candidate.ipap,epap=candidate.epap,cpap=candidate.cpap,flow=candidate.flow,fio2=candidate.fio2,
  is_standby=false,is_sbt=false,is_critical_vent=false,is_flolan=false,is_prone=false,
  ventilator_outcome='extubation',updated_by_staff_profile_id=actor_id
 where id=patient.id returning * into saved;
 insert into public.icu_patient_events(department_id,icu_patient_id,event_type,event_time,event_summary,event_data,created_by_staff_profile_id,created_by_name)
 values(saved.department_id,saved.id,'updated',extubated_at,'Extubated. Patient care continues.',
 jsonb_build_object('action','extubated','bed',saved.bed,'ventilatorOutcome','Extubation','ventilatorOutcomeValue','extubation',
 'modality',target_modality,'settings',settings,'record',to_jsonb(saved),'previousRecord',to_jsonb(patient)),actor_id,actor_name);
 return to_jsonb(saved);
end;
$$;
revoke all on function private.extubate_icu_patient(uuid,text,jsonb,timestamptz,timestamptz) from public,anon;
grant execute on function private.extubate_icu_patient(uuid,text,jsonb,timestamptz,timestamptz) to authenticated;
create or replace function public.extubate_icu_patient(target_patient_id uuid,target_modality text,target_settings jsonb,extubated_at timestamptz,expected_updated_at timestamptz)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select private.extubate_icu_patient(target_patient_id,target_modality,target_settings,extubated_at,expected_updated_at);
$$;
revoke all on function public.extubate_icu_patient(uuid,text,jsonb,timestamptz,timestamptz) from public,anon;
grant execute on function public.extubate_icu_patient(uuid,text,jsonb,timestamptz,timestamptz) to authenticated;
-- Ordinary modality switches retain profiles; extubation explicitly removes the vent.
create or replace function public.remember_icu_modalities()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare profiles jsonb; item jsonb;
begin
 profiles:=coalesce(new.rounding_data->'modalities','{}'::jsonb);
 foreach item in array array[to_jsonb(old),to_jsonb(new)] loop
  if item->>'device_type' <> 'none' then
   profiles:=jsonb_set(profiles,array[item->>'device_type'],public.icu_modality_profile(item->>'device_type',item));
  end if;
 end loop;
 if old.device_type='vent' and new.device_type<>'vent'
  and new.rounding_data->'extubation' is distinct from old.rounding_data->'extubation' then
  profiles:=profiles-'vent';
 end if;
 new.rounding_data:=jsonb_set(new.rounding_data,'{modalities}',profiles);
 return new;
end;
$$;
revoke all on function public.remember_icu_modalities() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
