create table if not exists public.official_vent_count_updates (
  id bigint generated always as identity primary key,
  department_id uuid not null references public.departments(id) on delete cascade,
  shift_date date not null,
  shift_type public.shift_status_shift_type not null,
  vent_count integer not null,
  source text not null,
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default clock_timestamp(),
  constraint official_vent_count_updates_count_nonnegative check (vent_count >= 0),
  constraint official_vent_count_updates_source_check
    check (source in ('lead_command_center', 'icu_command_center')),
  constraint official_vent_count_updates_name_length
    check (updated_by_name is null or char_length(updated_by_name) <= 120)
);

create index if not exists official_vent_count_updates_shift_latest_idx
  on public.official_vent_count_updates(department_id, shift_date, shift_type, created_at desc, id desc);

alter table public.official_vent_count_updates enable row level security;

drop policy if exists "Department members can read official vent count updates"
  on public.official_vent_count_updates;
create policy "Department members can read official vent count updates"
  on public.official_vent_count_updates
  for select
  to authenticated
  using (public.user_is_department_member(department_id));

revoke all on table public.official_vent_count_updates from public;
revoke insert, update, delete, truncate, references, trigger
  on table public.official_vent_count_updates from authenticated;
grant select on table public.official_vent_count_updates to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication publication
    where publication.pubname = 'supabase_realtime'
      and publication.puballtables = false
  )
  and not exists (
    select 1
    from pg_catalog.pg_publication_tables published_table
    where published_table.pubname = 'supabase_realtime'
      and published_table.schemaname = 'public'
      and published_table.tablename = 'official_vent_count_updates'
  ) then
    alter publication supabase_realtime
      add table public.official_vent_count_updates;
  end if;
end;
$$;

create or replace function public.publish_lead_official_vent_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_vent_count integer;
  previous_update_found boolean := false;
begin
  select prior.vent_count, true
    into previous_vent_count, previous_update_found
  from public.shift_status_updates prior
  where prior.department_id = new.department_id
    and prior.shift_date = new.shift_date
    and prior.shift_type = new.shift_type
    and prior.id <> new.id
  order by prior.created_at desc, prior.id desc
  limit 1;

  if not previous_update_found or previous_vent_count is distinct from new.vent_count then
    insert into public.official_vent_count_updates (
      department_id,
      shift_date,
      shift_type,
      vent_count,
      source,
      updated_by_staff_profile_id,
      updated_by_name
    )
    values (
      new.department_id,
      new.shift_date,
      new.shift_type,
      new.vent_count,
      'lead_command_center',
      new.updated_by_staff_profile_id,
      new.updated_by_name
    );
  end if;

  return new;
end;
$$;

revoke all on function public.publish_lead_official_vent_count() from public;
revoke all on function public.publish_lead_official_vent_count() from authenticated;

drop trigger if exists shift_status_updates_publish_official_vent
  on public.shift_status_updates;
create trigger shift_status_updates_publish_official_vent
  after insert on public.shift_status_updates
  for each row execute function public.publish_lead_official_vent_count();

create or replace function public.insert_icu_official_vent_count(
  target_department_id uuid,
  actor_staff_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  local_now timestamp without time zone := clock_timestamp() at time zone 'America/Los_Angeles';
  tracked_vent_count integer;
  actor_name text;
begin
  select count(*)::integer
    into tracked_vent_count
  from public.icu_patients patient
  where patient.department_id = target_department_id
    and patient.is_active = true
    and patient.device_type = 'vent';

  select profile.display_name
    into actor_name
  from public.staff_profiles profile
  where profile.id = actor_staff_profile_id;

  insert into public.official_vent_count_updates (
    department_id,
    shift_date,
    shift_type,
    vent_count,
    source,
    updated_by_staff_profile_id,
    updated_by_name
  )
  values (
    target_department_id,
    local_now::date,
    case
      when local_now::time >= time '08:00' and local_now::time < time '20:00'
        then 'day'::public.shift_status_shift_type
      else 'night'::public.shift_status_shift_type
    end,
    tracked_vent_count,
    'icu_command_center',
    actor_staff_profile_id,
    actor_name
  );
end;
$$;

revoke all on function public.insert_icu_official_vent_count(uuid, uuid) from public;
revoke all on function public.insert_icu_official_vent_count(uuid, uuid) from authenticated;

create or replace function public.publish_icu_official_vent_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_is_tracked_vent boolean :=
    case when tg_op = 'INSERT' then false else old.is_active and old.device_type = 'vent' end;
  new_is_tracked_vent boolean :=
    case when tg_op = 'DELETE' then false else new.is_active and new.device_type = 'vent' end;
  actor_staff_profile_id uuid :=
    case
      when tg_op = 'DELETE' then old.updated_by_staff_profile_id
      else coalesce(new.updated_by_staff_profile_id, new.created_by_staff_profile_id)
    end;
begin
  if tg_op = 'UPDATE' and old.department_id is distinct from new.department_id then
    if old_is_tracked_vent then
      perform public.insert_icu_official_vent_count(old.department_id, actor_staff_profile_id);
    end if;

    if new_is_tracked_vent then
      perform public.insert_icu_official_vent_count(new.department_id, actor_staff_profile_id);
    end if;

    return new;
  end if;

  if old_is_tracked_vent is distinct from new_is_tracked_vent then
    perform public.insert_icu_official_vent_count(
      case when tg_op = 'DELETE' then old.department_id else new.department_id end,
      actor_staff_profile_id
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.publish_icu_official_vent_count() from public;
revoke all on function public.publish_icu_official_vent_count() from authenticated;

drop trigger if exists icu_patients_publish_official_vent
  on public.icu_patients;
create trigger icu_patients_publish_official_vent
  after insert or update or delete on public.icu_patients
  for each row execute function public.publish_icu_official_vent_count();

do $$
declare
  local_now timestamp without time zone := clock_timestamp() at time zone 'America/Los_Angeles';
  current_shift_date date := local_now::date;
  current_shift_type public.shift_status_shift_type :=
    case
      when local_now::time >= time '08:00' and local_now::time < time '20:00'
        then 'day'::public.shift_status_shift_type
      else 'night'::public.shift_status_shift_type
    end;
begin
  insert into public.official_vent_count_updates (
    department_id,
    shift_date,
    shift_type,
    vent_count,
    source,
    updated_by_staff_profile_id,
    updated_by_name
  )
  select
    department.id,
    current_shift_date,
    current_shift_type,
    coalesce(latest_lead.vent_count, tracked_icu.vent_count),
    case
      when latest_lead.id is not null then 'lead_command_center'
      else 'icu_command_center'
    end,
    coalesce(latest_lead.updated_by_staff_profile_id, tracked_icu.updated_by_staff_profile_id),
    coalesce(latest_lead.updated_by_name, tracked_icu.updated_by_name)
  from public.departments department
  left join lateral (
    select
      update_row.id,
      update_row.vent_count,
      update_row.updated_by_staff_profile_id,
      update_row.updated_by_name
    from public.shift_status_updates update_row
    where update_row.department_id = department.id
      and update_row.shift_date = current_shift_date
      and update_row.shift_type = current_shift_type
    order by update_row.created_at desc, update_row.id desc
    limit 1
  ) latest_lead on true
  left join lateral (
    select
      count(*) filter (
        where patient.is_active = true and patient.device_type = 'vent'
      )::integer as vent_count,
      (
        array_agg(patient.updated_by_staff_profile_id order by patient.updated_at desc)
          filter (where patient.updated_by_staff_profile_id is not null)
      )[1] as updated_by_staff_profile_id,
      (
        array_agg(profile.display_name order by patient.updated_at desc)
          filter (where profile.display_name is not null)
      )[1] as updated_by_name,
      count(*)::integer as patient_count
    from public.icu_patients patient
    left join public.staff_profiles profile
      on profile.id = patient.updated_by_staff_profile_id
    where patient.department_id = department.id
  ) tracked_icu on true
  where (
    latest_lead.id is not null
    or tracked_icu.patient_count > 0
  )
  and not exists (
    select 1
    from public.official_vent_count_updates existing
    where existing.department_id = department.id
      and existing.shift_date = current_shift_date
      and existing.shift_type = current_shift_type
  );
end;
$$;
