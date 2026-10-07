-- Remember each noninvasive modality without creating a second active device.
create function public.remember_icu_modalities()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare profiles jsonb; settings jsonb; item jsonb;
begin
  profiles := coalesce(new.rounding_data->'modalities', '{}'::jsonb);
  -- Save both sides of every change, including changes made through the normal Update form.
  foreach item in array array[to_jsonb(old), to_jsonb(new)] loop
    if item->>'device_type' in ('hfnc','bipap') then
      if item->>'device_type' = 'hfnc' then
        settings := jsonb_build_object('flow',item->'flow','fio2',item->'fio2');
      else
        settings := jsonb_build_object('ipap',item->'ipap','epap',item->'epap','rate',item->'rate','fio2',item->'fio2');
      end if;
      profiles := jsonb_set(profiles, array[item->>'device_type'], settings);
    end if;
  end loop;
  new.rounding_data := jsonb_set(new.rounding_data, '{modalities}', profiles);
  return new;
end;
$$;
revoke all on function public.remember_icu_modalities() from public, anon, authenticated;
create trigger remember_icu_modalities before update on public.icu_patients
for each row execute function public.remember_icu_modalities();

create function public.save_icu_modality(
  target_patient_id uuid, target_modality text, target_settings jsonb,
  activate boolean, expected_updated_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  patient public.icu_patients%rowtype;
  saved public.icu_patients%rowtype;
  actor_id uuid; actor_name text; settings jsonb := '{}'::jsonb;
  field text; value jsonb; snapshot jsonb; summary text;
begin
  if target_modality is null or target_modality not in ('hfnc','bipap') or activate is null then
    raise exception 'Select HFNC or BiPAP' using errcode = '22023';
  end if;
  select p.* into patient from public.icu_patients p
  where p.id=target_patient_id and p.is_active and public.user_can_manage_icu_patients(p.department_id) for update;
  if not found then raise exception 'Patient unavailable or not authorized' using errcode = '42501'; end if;
  if expected_updated_at is null or patient.updated_at is distinct from expected_updated_at then
    raise exception 'This patient was updated. Refresh the card and try again.' using errcode = '40001';
  end if;
  if patient.device_type not in ('hfnc','bipap') or patient.device_type=target_modality then
    raise exception 'Choose an additional modality for HFNC or BiPAP' using errcode = '22023';
  end if;
  actor_id := public.current_staff_profile_id(patient.department_id);
  select display_name into actor_name from public.profiles where id=public.current_profile_id();
  if actor_id is null or actor_name is null then raise exception 'Active ICU actor required' using errcode = '42501'; end if;
  -- Activation uses only the stored profile, never an unreviewed client replacement.
  if activate then target_settings := patient.rounding_data #> array['modalities',target_modality]; end if;
  if target_settings is null or jsonb_typeof(target_settings)<>'object' then
    raise exception 'Save settings for this modality first' using errcode = '22023';
  end if;
  foreach field in array case when target_modality='hfnc' then array['flow','fio2'] else array['ipap','epap','rate','fio2'] end loop
    value := coalesce(target_settings->field,'null'::jsonb);
    if value <> 'null'::jsonb then
      if jsonb_typeof(value)<>'number' then raise exception 'Settings must be non-negative numbers' using errcode='22023'; end if;
      if (value::text)::numeric < 0 or (field='fio2' and (value::text)::numeric>100) then
        raise exception 'Invalid setting value' using errcode='22023';
      end if;
    end if;
    settings := settings || jsonb_build_object(field,value);
  end loop;
  snapshot := jsonb_set(patient.rounding_data,'{modalities}',coalesce(patient.rounding_data->'modalities','{}'::jsonb) || jsonb_build_object(target_modality,settings));
  update public.icu_patients set rounding_data=snapshot,
    device_type=case when activate then target_modality else device_type end,
    flow=case when activate then (settings->>'flow')::numeric else flow end,
    ipap=case when activate then (settings->>'ipap')::numeric else ipap end,
    epap=case when activate then (settings->>'epap')::numeric else epap end,
    rate=case when activate then (settings->>'rate')::numeric else rate end,
    fio2=case when activate then (settings->>'fio2')::numeric else fio2 end,
    updated_by_staff_profile_id=actor_id
  where id=patient.id returning * into saved;
  summary := case when activate then 'Switched to ' else 'Saved additional modality: ' end || case when target_modality='hfnc' then 'HFNC' else 'BiPAP' end;
  insert into public.icu_patient_events(department_id,icu_patient_id,event_type,event_time,event_summary,event_data,created_by_staff_profile_id,created_by_name)
  values(saved.department_id,saved.id,'updated',clock_timestamp(),summary,
    jsonb_build_object('action',case when activate then 'modality_switched' else 'modality_saved' end,
      'modality',target_modality,'settings',settings,'record',to_jsonb(saved),'previousRecord',to_jsonb(patient),'bed',saved.bed),actor_id,actor_name);
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_icu_modality(uuid,text,jsonb,boolean,timestamptz) from public, anon;
grant execute on function public.save_icu_modality(uuid,text,jsonb,boolean,timestamptz) to authenticated;
