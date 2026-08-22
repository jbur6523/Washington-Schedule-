alter table public.icu_patients
  add column if not exists is_sbt boolean not null default false,
  add column if not exists is_flolan boolean not null default false,
  add column if not exists is_prone boolean not null default false;

alter table public.icu_patient_events
  add column if not exists operational_shift_date date,
  add column if not exists operational_shift_type text;

alter table public.icu_patient_events
  drop constraint if exists icu_patient_events_type_check;

alter table public.icu_patient_events
  add constraint icu_patient_events_type_check
  check (event_type in (
    'added',
    'updated',
    'critical_status_updated',
    'sbt_status_updated',
    'flolan_status_updated',
    'prone_status_updated',
    'standby_status_updated',
    'ct_noted',
    'mri_noted',
    'discontinued'
  ));

alter table public.icu_patient_events
  drop constraint if exists icu_patient_events_operational_shift_check;

alter table public.icu_patient_events
  add constraint icu_patient_events_operational_shift_check
  check (
    (
      event_type in ('ct_noted', 'mri_noted')
      and operational_shift_date is not null
      and operational_shift_type in ('day', 'night')
    )
    or (
      event_type not in ('ct_noted', 'mri_noted')
      and operational_shift_date is null
      and operational_shift_type is null
    )
  );

create unique index if not exists icu_patient_events_one_shift_note_idx
  on public.icu_patient_events (
    icu_patient_id,
    event_type,
    operational_shift_date,
    operational_shift_type
  )
  where event_type in ('ct_noted', 'mri_noted');

create index if not exists icu_patient_events_department_shift_idx
  on public.icu_patient_events (
    department_id,
    operational_shift_date,
    operational_shift_type,
    event_type
  )
  where event_type in ('ct_noted', 'mri_noted');

create or replace function public.set_icu_vent_status(
  target_patient_id uuid,
  target_status text,
  target_active boolean,
  target_event_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  patient public.icu_patients%rowtype;
  updated_patient public.icu_patients%rowtype;
  actor_staff_profile_id uuid;
  actor_name text;
  current_active boolean;
  event_type_value text;
  event_summary_value text;
begin
  if target_status not in ('sbt', 'critical', 'flolan', 'prone') then
    raise exception 'unsupported_icu_vent_status' using errcode = '22023';
  end if;

  select candidate.*
  into patient
  from public.icu_patients candidate
  where candidate.id = target_patient_id
    and candidate.device_type = 'vent'
    and candidate.is_active = true
    and public.user_can_manage_icu_patients(candidate.department_id)
  for update;

  if not found then
    raise exception 'icu_vent_not_found_or_not_authorized' using errcode = 'P0002';
  end if;

  actor_staff_profile_id := public.current_staff_profile_id(patient.department_id);
  select profile.display_name
  into actor_name
  from public.profiles profile
  where profile.id = public.current_profile_id();

  if actor_staff_profile_id is null or actor_name is null then
    raise exception 'active_icu_actor_not_found' using errcode = '42501';
  end if;

  current_active := case target_status
    when 'sbt' then patient.is_sbt
    when 'critical' then patient.is_critical_vent
    when 'flolan' then patient.is_flolan
    when 'prone' then patient.is_prone
  end;

  if current_active = target_active then
    return to_jsonb(patient);
  end if;

  update public.icu_patients
  set
    is_sbt = case when target_status = 'sbt' then target_active else is_sbt end,
    is_critical_vent = case when target_status = 'critical' then target_active else is_critical_vent end,
    is_flolan = case when target_status = 'flolan' then target_active else is_flolan end,
    is_prone = case when target_status = 'prone' then target_active else is_prone end,
    updated_by_staff_profile_id = actor_staff_profile_id
  where id = patient.id
  returning * into updated_patient;

  event_type_value := case target_status
    when 'sbt' then 'sbt_status_updated'
    when 'critical' then 'critical_status_updated'
    when 'flolan' then 'flolan_status_updated'
    when 'prone' then 'prone_status_updated'
  end;
  event_summary_value := case
    when target_status = 'sbt' and target_active then 'SBT marked active'
    when target_status = 'sbt' then 'SBT status cleared'
    when target_status = 'critical' and target_active then 'Critical status marked'
    when target_status = 'critical' then 'Critical status cleared'
    when target_status = 'flolan' and target_active then 'Flolan marked active'
    when target_status = 'flolan' then 'Flolan status cleared'
    when target_status = 'prone' and target_active then 'Prone status marked'
    else 'Prone status cleared'
  end;

  insert into public.icu_patient_events (
    department_id,
    icu_patient_id,
    event_type,
    event_time,
    event_summary,
    event_data,
    created_by_staff_profile_id,
    created_by_name
  ) values (
    updated_patient.department_id,
    updated_patient.id,
    event_type_value,
    statement_timestamp(),
    event_summary_value,
    coalesce(target_event_data, '{}'::jsonb) || jsonb_build_object(
      'bed', updated_patient.bed,
      'status', target_status,
      'active', target_active,
      'criticalVent', updated_patient.is_critical_vent,
      'sbt', updated_patient.is_sbt,
      'flolan', updated_patient.is_flolan,
      'prone', updated_patient.is_prone,
      'updatedState', coalesce(target_event_data -> 'updatedState', '{}'::jsonb) || jsonb_build_object(
        'criticalVent', updated_patient.is_critical_vent,
        'sbt', updated_patient.is_sbt,
        'flolan', updated_patient.is_flolan,
        'prone', updated_patient.is_prone
      )
    ),
    actor_staff_profile_id,
    actor_name
  );

  return to_jsonb(updated_patient);
end;
$$;

create or replace function public.note_icu_vent_shift_event(
  target_patient_id uuid,
  target_event text,
  target_event_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  patient public.icu_patients%rowtype;
  saved_event public.icu_patient_events%rowtype;
  actor_staff_profile_id uuid;
  actor_name text;
  board_updated_at timestamptz := statement_timestamp();
  hospital_time timestamp;
  shift_date_value date;
  shift_type_value text;
  event_type_value text;
  event_summary_value text;
  created_value boolean := false;
begin
  if target_event not in ('ct', 'mri') then
    raise exception 'unsupported_icu_vent_shift_event' using errcode = '22023';
  end if;

  select candidate.*
  into patient
  from public.icu_patients candidate
  where candidate.id = target_patient_id
    and candidate.device_type = 'vent'
    and candidate.is_active = true
    and public.user_can_manage_icu_patients(candidate.department_id);

  if not found then
    raise exception 'icu_vent_not_found_or_not_authorized' using errcode = 'P0002';
  end if;

  actor_staff_profile_id := public.current_staff_profile_id(patient.department_id);
  select profile.display_name
  into actor_name
  from public.profiles profile
  where profile.id = public.current_profile_id();

  if actor_staff_profile_id is null or actor_name is null then
    raise exception 'active_icu_actor_not_found' using errcode = '42501';
  end if;

  hospital_time := board_updated_at at time zone 'America/Los_Angeles';
  if hospital_time::time < time '07:00' then
    shift_date_value := hospital_time::date - 1;
    shift_type_value := 'night';
  elsif hospital_time::time < time '19:00' then
    shift_date_value := hospital_time::date;
    shift_type_value := 'day';
  else
    shift_date_value := hospital_time::date;
    shift_type_value := 'night';
  end if;

  event_type_value := target_event || '_noted';
  event_summary_value := upper(target_event) || ' noted this shift';

  insert into public.icu_patient_events (
    department_id,
    icu_patient_id,
    event_type,
    event_time,
    event_summary,
    event_data,
    created_by_staff_profile_id,
    created_by_name,
    operational_shift_date,
    operational_shift_type
  ) values (
    patient.department_id,
    patient.id,
    event_type_value,
    board_updated_at,
    event_summary_value,
    coalesce(target_event_data, '{}'::jsonb) || jsonb_build_object(
      'bed', patient.bed,
      'shiftEvent', target_event,
      'operationalShiftId', shift_date_value::text || ':' || shift_type_value
    ),
    actor_staff_profile_id,
    actor_name,
    shift_date_value,
    shift_type_value
  )
  on conflict (
    icu_patient_id,
    event_type,
    operational_shift_date,
    operational_shift_type
  ) where event_type in ('ct_noted', 'mri_noted')
  do nothing
  returning * into saved_event;

  if found then
    created_value := true;
  else
    select existing.*
    into saved_event
    from public.icu_patient_events existing
    where existing.icu_patient_id = patient.id
      and existing.event_type = event_type_value
      and existing.operational_shift_date = shift_date_value
      and existing.operational_shift_type = shift_type_value;
  end if;

  return jsonb_build_object(
    'created', created_value,
    'event', to_jsonb(saved_event)
  );
end;
$$;

revoke all on function public.set_icu_vent_status(uuid, text, boolean, jsonb) from public;
revoke all on function public.set_icu_vent_status(uuid, text, boolean, jsonb) from anon;
grant execute on function public.set_icu_vent_status(uuid, text, boolean, jsonb) to authenticated;

revoke all on function public.note_icu_vent_shift_event(uuid, text, jsonb) from public;
revoke all on function public.note_icu_vent_shift_event(uuid, text, jsonb) from anon;
grant execute on function public.note_icu_vent_shift_event(uuid, text, jsonb) to authenticated;
