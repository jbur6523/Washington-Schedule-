-- Compact rounding snapshot; the immutable event stream remains the full audit trail.
alter table public.icu_patients add column rounding_data jsonb not null default '{}'::jsonb
  check (jsonb_typeof(rounding_data) = 'object');

create function public.maintain_icu_rounding_snapshot()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare
  settings_keys text[] := array['device_type','vent_mode','rate','tidal_volume','peep','fio2','ps','t_high','t_low','p_high','p_low','percent_min_vol','ipap','epap','cpap','flow'];
  old_settings jsonb;
  new_settings jsonb;
begin
  select jsonb_object_agg(key, value) into old_settings from jsonb_each(to_jsonb(old)) where key = any(settings_keys);
  select jsonb_object_agg(key, value) into new_settings from jsonb_each(to_jsonb(new)) where key = any(settings_keys);
  if old_settings is distinct from new_settings then
    new.rounding_data := jsonb_set(new.rounding_data, '{previousSettings}', old_settings);
  end if;
  -- Leaving continuous Pressure Support ends an explicitly documented weaning state.
  -- Returning to Pressure Support never starts SBT implicitly.
  if new.vent_mode is distinct from 'spont' or new.device_type <> 'vent' or not new.is_active then
    new.is_sbt := false;
  end if;
  return new;
end;
$$;
revoke all on function public.maintain_icu_rounding_snapshot() from public, anon, authenticated;
create trigger maintain_icu_rounding_snapshot before update on public.icu_patients
  for each row execute function public.maintain_icu_rounding_snapshot();

create function public.record_icu_rounding_action(
  target_patient_id uuid,
  target_action text,
  target_payload jsonb,
  expected_updated_at timestamptz
)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  patient public.icu_patients%rowtype;
  saved public.icu_patients%rowtype;
  actor_id uuid;
  actor_name text;
  snapshot jsonb;
  event_kind text := 'updated';
  summary text;
  detail text;
  result_value text;
  procedure_name text;
  event_at timestamptz := clock_timestamp();
begin
  if target_action is null or target_action not in ('sbt','critical','procedure','note')
    or target_payload is null or jsonb_typeof(target_payload) <> 'object' then
    raise exception 'Invalid rounding action' using errcode = '22023';
  end if;
  select p.* into patient from public.icu_patients p
    where p.id = target_patient_id and p.is_active and public.user_can_manage_icu_patients(p.department_id)
    for update;
  if not found then raise exception 'Patient unavailable or not authorized' using errcode = '42501'; end if;
  if expected_updated_at is null or patient.updated_at is distinct from expected_updated_at then
    raise exception 'This patient was updated. Refresh the card and try again.' using errcode = '40001';
  end if;
  actor_id := public.current_staff_profile_id(patient.department_id);
  select display_name into actor_name from public.profiles where id = public.current_profile_id();
  if actor_id is null or actor_name is null then raise exception 'Active ICU actor required' using errcode = '42501'; end if;
  snapshot := patient.rounding_data;

  if target_action = 'sbt' then
    result_value := target_payload->>'result';
    if patient.device_type <> 'vent' or result_value is null or result_value not in ('Pass','Fail') then
      raise exception 'Select Pass or Fail for a ventilated patient' using errcode = '22023';
    end if;
    if result_value = 'Fail' then
      detail := target_payload->>'reason';
      if detail is null or detail not in ('Poor neuro status','Excessive secretions','High RSBI','Hemodynamic instability','Oxygenation','Other') then
        raise exception 'Select an SBT failure reason' using errcode = '22023';
      end if;
      if detail = 'Other' then
        if nullif(btrim(target_payload->>'other'), '') is null or length(target_payload->>'other') > 200 then
          raise exception 'Enter a short failure reason' using errcode = '22023';
        end if;
        detail := 'Other — ' || btrim(target_payload->>'other');
      end if;
    elsif patient.is_sbt and patient.vent_mode = 'spont' and snapshot #>> '{sbt,result}' = 'Pass' then
      return to_jsonb(patient); -- Do not restart or duplicate a continuous SBT.
    end if;
    snapshot := jsonb_set(snapshot, '{sbt}', jsonb_build_object('result', result_value, 'at', event_at, 'reason', detail));
    update public.icu_patients set rounding_data = snapshot,
      is_sbt = result_value = 'Pass' and vent_mode = 'spont', updated_by_staff_profile_id = actor_id
      where id = patient.id returning * into saved;
    event_kind := 'sbt_status_updated';
    summary := 'SBT: ' || case when result_value = 'Pass' then 'Passed' else 'Failed — ' || detail end;
  elsif target_action = 'critical' then
    if jsonb_typeof(target_payload->'flolan') is distinct from 'boolean'
      or jsonb_typeof(target_payload->'proned') is distinct from 'boolean' then
      raise exception 'Select Critical options' using errcode = '22023';
    end if;
    detail := nullif(btrim(target_payload->>'other'), '');
    if length(detail) > 200 then raise exception 'Keep the reason under 200 characters' using errcode = '22023'; end if;
    snapshot := jsonb_set(snapshot, '{criticalOther}', coalesce(to_jsonb(detail), 'null'::jsonb));
    update public.icu_patients set rounding_data = snapshot,
      is_flolan = (target_payload->>'flolan')::boolean,
      is_prone = (target_payload->>'proned')::boolean,
      is_critical_vent = (target_payload->>'flolan')::boolean or (target_payload->>'proned')::boolean or detail is not null,
      updated_by_staff_profile_id = actor_id where id = patient.id returning * into saved;
    event_kind := 'critical_status_updated';
    summary := case when saved.is_critical_vent then 'Critical: ' || concat_ws(' · ', case when saved.is_flolan then 'Flolan' end, case when saved.is_prone then 'Proned' end, case when detail is not null then 'Other — ' || detail end) else 'Critical cleared' end;
  elsif target_action = 'procedure' then
    procedure_name := target_payload->>'name';
    if procedure_name is null or procedure_name not in ('Bronch','CT','MRI','Trach','Other') then
      raise exception 'Select a procedure' using errcode = '22023';
    end if;
    detail := nullif(btrim(target_payload->>'other'), '');
    if procedure_name = 'Other' and (detail is null or length(detail) > 200) then
      raise exception 'Enter a short procedure description' using errcode = '22023';
    end if;
    if procedure_name = 'Trach' then
      if patient.device_type <> 'vent' or coalesce(target_payload->>'trachType','') not in ('Shiley','Portex','Other')
        or coalesce(target_payload->>'size','') not in ('4','5','6','7','8')
        or jsonb_typeof(target_payload->'xlt') is distinct from 'boolean' then
        raise exception 'Select trach type and size for a ventilated patient' using errcode = '22023';
      end if;
      if nullif(target_payload->>'date','') is not null then
        perform (target_payload->>'date')::date;
      end if;
    end if;
    -- Whitelist snapshot fields; event timestamp and actor always come from the server.
    snapshot := jsonb_set(snapshot, '{procedure}', jsonb_build_object('name',procedure_name,'at',event_at,
      'other',case when procedure_name = 'Other' then detail end,
      'trachType',case when procedure_name = 'Trach' then target_payload->>'trachType' end,
      'size',case when procedure_name = 'Trach' then target_payload->>'size' end,
      'xlt',case when procedure_name = 'Trach' then (target_payload->>'xlt')::boolean end,
      'date',case when procedure_name = 'Trach' then nullif(target_payload->>'date','') end));
    update public.icu_patients set rounding_data = snapshot,
      airway_type = case when procedure_name = 'Trach' then 'trach' else airway_type end,
      trach_type = case when procedure_name = 'Trach' then lower(target_payload->>'trachType') else trach_type end,
      airway_size = case when procedure_name = 'Trach' then target_payload->>'size' else airway_size end,
      airway_at = case when procedure_name = 'Trach' then null else airway_at end,
      airway_location = case when procedure_name = 'Trach' then null else airway_location end,
      trach_xlt = case when procedure_name = 'Trach' then (target_payload->>'xlt')::boolean else trach_xlt end,
      updated_by_staff_profile_id = actor_id where id = patient.id returning * into saved;
    summary := 'Procedure: ' || procedure_name || case when procedure_name = 'Other' then ' — ' || detail
      when procedure_name = 'Trach' then ' — ' || (target_payload->>'trachType') || ' ' || (target_payload->>'size') || case when (target_payload->>'xlt')::boolean then ' XLT' else '' end || case when nullif(target_payload->>'date','') is not null then ' — ' || (target_payload->>'date') else '' end else '' end;
  else
    detail := nullif(btrim(target_payload->>'notes'), '');
    if length(detail) > 2000 then raise exception 'Keep the note under 2000 characters' using errcode = '22023'; end if;
    update public.icu_patients set notes = detail, updated_by_staff_profile_id = actor_id where id = patient.id returning * into saved;
    summary := case when detail is null then 'ICU note cleared' else 'ICU note updated' end;
  end if;

  insert into public.icu_patient_events(department_id,icu_patient_id,event_type,event_time,event_summary,event_data,created_by_staff_profile_id,created_by_name)
  values(saved.department_id,saved.id,event_kind,event_at,summary,
    jsonb_build_object('action',case when target_action = 'note' then 'note_updated' else target_action || '_recorded' end,
      'record',to_jsonb(saved),'previousRecord',to_jsonb(patient),'bed',saved.bed,'notes',saved.notes),actor_id,actor_name);
  return to_jsonb(saved);
end;
$$;
revoke all on function public.record_icu_rounding_action(uuid,text,jsonb,timestamptz) from public, anon;
grant execute on function public.record_icu_rounding_action(uuid,text,jsonb,timestamptz) to authenticated;
