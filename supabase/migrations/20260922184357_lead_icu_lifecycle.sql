-- Lead lifecycle access is deliberately separate from full ICU editing.
create or replace function public.user_can_manage_icu_lifecycle(target_department_id uuid)
returns boolean language sql stable security invoker set search_path = pg_catalog as $$
  select public.user_can_manage_icu_patients(target_department_id)
    or public.user_is_department_lead_or_admin(target_department_id)
    or public.user_is_command_center(target_department_id);
$$;
revoke all on function public.user_can_manage_icu_lifecycle(uuid) from public, anon;
grant execute on function public.user_can_manage_icu_lifecycle(uuid) to authenticated;

create or replace function public.user_can_view_icu_patients(target_department_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select public.user_can_manage_icu_lifecycle(target_department_id)
    or public.user_is_department_director(target_department_id)
    or public.user_is_department_leadership(target_department_id);
$$;
revoke all on function public.user_can_view_icu_patients(uuid) from public, anon;
grant execute on function public.user_can_view_icu_patients(uuid) to authenticated;

-- Keep elevated writes outside the API schema. The public wrapper is invoker-only.
-- No patient/event INSERT or UPDATE policy is widened for Leads.
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.manage_icu_device(
  target_department_id uuid, target_action text, target_payload jsonb,
  target_event_data jsonb, target_patient_id uuid, expected_updated_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  patient public.icu_patients%rowtype;
  saved public.icu_patients%rowtype;
  input public.icu_patients%rowtype;
  actor_id uuid;
  actor_name text;
  event_at timestamptz := now();
  outcome text;
  summary text;
begin
  if auth.uid() is null or not public.user_can_manage_icu_lifecycle(target_department_id) then
    raise exception 'Not authorized to manage devices in this department.' using errcode = '42501';
  end if;
  actor_id := public.current_staff_profile_id(target_department_id);
  select display_name into actor_name from public.profiles where id = public.current_profile_id();
  if actor_id is null or actor_name is null then
    raise exception 'Active ICU actor not found.' using errcode = '42501';
  end if;
  if jsonb_typeof(target_payload) is distinct from 'object'
    or jsonb_typeof(target_event_data) is distinct from 'object' then
    raise exception 'Invalid device payload.' using errcode = '22023';
  end if;

  if target_action = 'add' then
    -- Explicit columns prevent callers from supplying IDs, status toggles,
    -- inactivity, department overrides, or another staff member's attribution.
    input := jsonb_populate_record(null::public.icu_patients, target_payload);
    if input.device_type = 'vent' and input.vent_mode is null then
      raise exception 'Vent Mode is required for Vent patients.' using errcode = '22023';
    end if;
    insert into public.icu_patients (
      department_id, bed, device_type, airway_size, airway_at, airway_location,
      vent_mode, rate, tidal_volume, peep, fio2, ps, t_high, t_low, p_high, p_low,
      percent_min_vol, ipap, epap, cpap, flow, notes, is_standby,
      created_by_staff_profile_id, updated_by_staff_profile_id
    ) values (
      target_department_id, trim(input.bed), input.device_type, input.airway_size,
      input.airway_at, input.airway_location, input.vent_mode, input.rate,
      input.tidal_volume, input.peep, input.fio2, input.ps, input.t_high,
      input.t_low, input.p_high, input.p_low, input.percent_min_vol,
      input.ipap, input.epap, input.cpap, input.flow, nullif(trim(input.notes), ''),
      coalesce(input.is_standby, false), actor_id, actor_id
    ) returning * into saved;
    summary := 'ICU device added.';
  elsif target_action = 'discontinue' then
    select * into patient from public.icu_patients
    where id = target_patient_id and department_id = target_department_id and is_active
    for update;
    if not found then
      raise exception 'Active device not found.' using errcode = 'P0002';
    end if;
    if expected_updated_at is distinct from patient.updated_at then
      raise exception 'Device changed. Refresh and review before discontinuing.' using errcode = '40001';
    end if;
    event_at := (target_payload->>'discontinued_at')::timestamptz;
    if event_at is null or not isfinite(event_at) then
      raise exception 'Discontinued date and time are required.' using errcode = '22023';
    end if;
    outcome := case when patient.device_type = 'vent' then nullif(target_payload->>'ventilator_outcome', '') else null end;
    if patient.device_type = 'vent' and outcome is null then
      raise exception 'Select a ventilator outcome.' using errcode = '22023';
    end if;
    -- The existing table constraint validates the existing outcome vocabulary.
    update public.icu_patients set is_active = false, discontinued_at = event_at,
      discontinued_by_staff_profile_id = actor_id, updated_by_staff_profile_id = actor_id,
      ventilator_outcome = outcome
    where id = patient.id returning * into saved;
    summary := case when outcome is null then 'Device discontinued.'
      else 'Discontinued. Outcome: ' || coalesce(target_event_data->>'ventilatorOutcome', outcome) || '.' end;
  else
    raise exception 'Only add and discontinue are supported.' using errcode = '22023';
  end if;

  -- Both writes commit together. Keep shared formatted history, plus a canonical
  -- server-derived snapshot; actor, record identity and event time cannot be forged.
  insert into public.icu_patient_events (
    department_id, icu_patient_id, event_type, event_time, event_summary, event_data,
    created_by_staff_profile_id, created_by_name
  ) values (
    target_department_id, saved.id, case when target_action = 'add' then 'added' else 'discontinued' end,
    event_at, summary, target_event_data || jsonb_build_object(
      'bed', saved.bed, 'notes', saved.notes, 'record', to_jsonb(saved),
      'action', case when target_action = 'add' then 'added' else 'discontinued' end,
      'discontinuedAt', saved.discontinued_at, 'ventilatorOutcomeValue', saved.ventilator_outcome
    ), actor_id, actor_name
  );
  return to_jsonb(saved);
end;
$$;
revoke all on function private.manage_icu_device(uuid, text, jsonb, jsonb, uuid, timestamptz) from public, anon;
grant execute on function private.manage_icu_device(uuid, text, jsonb, jsonb, uuid, timestamptz) to authenticated;

create or replace function public.manage_icu_device(
  target_department_id uuid, target_action text, target_payload jsonb,
  target_event_data jsonb, target_patient_id uuid default null, expected_updated_at timestamptz default null
)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select private.manage_icu_device(target_department_id, target_action, target_payload,
    target_event_data, target_patient_id, expected_updated_at);
$$;
revoke all on function public.manage_icu_device(uuid, text, jsonb, jsonb, uuid, timestamptz) from public, anon;
grant execute on function public.manage_icu_device(uuid, text, jsonb, jsonb, uuid, timestamptz) to authenticated;
