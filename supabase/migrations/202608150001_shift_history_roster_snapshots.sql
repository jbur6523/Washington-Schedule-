-- Canonical Shift History and immutable Phone List roster capture.
-- Existing clinical values are preserved; legacy duplicate windows remain as
-- non-canonical rows so no historical record is deleted or rewritten.

alter table public.shift_status_updates
  add column if not exists is_canonical boolean;

with ranked as (
  select
    update_row.id,
    row_number() over (
      partition by update_row.department_id, update_row.shift_date, update_row.shift_type
      order by update_row.updated_at desc, update_row.created_at desc, update_row.id desc
    ) as canonical_rank
  from public.shift_status_updates update_row
)
update public.shift_status_updates update_row
set is_canonical = ranked.canonical_rank = 1
from ranked
where ranked.id = update_row.id
  and update_row.is_canonical is null;

alter table public.shift_status_updates
  alter column is_canonical set default true;

alter table public.shift_status_updates
  alter column is_canonical set not null;

create unique index if not exists shift_status_updates_one_canonical_window_idx
  on public.shift_status_updates(department_id, shift_date, shift_type)
  where is_canonical = true;

create index if not exists shift_status_updates_history_idx
  on public.shift_status_updates(department_id, shift_date desc, shift_type, updated_at desc)
  where is_canonical = true;

comment on column public.shift_status_updates.is_canonical is
  'Exactly one current History record per department, reporting date, and Day/Night shift. Legacy duplicates remain non-canonical.';

create or replace function public.shift_status_record_options()
returns table (
  day_shift_date date,
  night_shift_date date,
  default_shift_type public.shift_status_shift_type
)
language sql
stable
set search_path = pg_catalog
as $$
  with pacific_now as (
    select pg_catalog.statement_timestamp() at time zone 'America/Los_Angeles' as local_now
  )
  select
    case
      when local_now::time < time '04:00' then local_now::date - 1
      else local_now::date
    end,
    case
      when local_now::time < time '16:00' then local_now::date - 1
      else local_now::date
    end,
    case
      when local_now::time >= time '04:00' and local_now::time < time '16:00'
        then 'day'::public.shift_status_shift_type
      else 'night'::public.shift_status_shift_type
    end
  from pacific_now;
$$;

revoke all on function public.shift_status_record_options()
  from public, anon;
grant execute on function public.shift_status_record_options()
  to authenticated, service_role;

create table if not exists public.phone_list_roster_snapshots (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  shift_date date not null,
  shift_type public.shift_status_shift_type not null,
  captured_at timestamptz not null default now(),
  captured_by_profile_id uuid references public.profiles(id) on delete set null,
  captured_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phone_list_roster_snapshots_window_unique
    unique (department_id, shift_date, shift_type),
  constraint phone_list_roster_snapshots_actor_name_length
    check (captured_by_name is null or char_length(captured_by_name) <= 120)
);

create table if not exists public.phone_list_roster_entries (
  id uuid primary key default gen_random_uuid(),
  roster_snapshot_id uuid not null references public.phone_list_roster_snapshots(id) on delete cascade,
  display_order smallint not null,
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  staff_display_name text not null,
  area_labels text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint phone_list_roster_entries_order_check check (display_order between 1 and 31),
  constraint phone_list_roster_entries_name_length check (
    char_length(staff_display_name) between 1 and 120
    and staff_display_name = btrim(staff_display_name)
  ),
  constraint phone_list_roster_entries_area_count check (cardinality(area_labels) between 0 and 31),
  constraint phone_list_roster_entries_snapshot_order_unique
    unique (roster_snapshot_id, display_order)
);

create index if not exists phone_list_roster_snapshots_history_idx
  on public.phone_list_roster_snapshots(department_id, shift_date desc, shift_type);

create index if not exists phone_list_roster_entries_snapshot_idx
  on public.phone_list_roster_entries(roster_snapshot_id, display_order);

drop trigger if exists phone_list_roster_snapshots_set_updated_at
  on public.phone_list_roster_snapshots;
create trigger phone_list_roster_snapshots_set_updated_at
  before update on public.phone_list_roster_snapshots
  for each row execute function public.set_updated_at();

alter table public.phone_list_roster_snapshots enable row level security;
alter table public.phone_list_roster_entries enable row level security;

drop policy if exists "Lead Command Board users can read roster snapshots"
  on public.phone_list_roster_snapshots;
create policy "Lead Command Board users can read roster snapshots"
  on public.phone_list_roster_snapshots
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
  );

drop policy if exists "Lead Command Board users can read roster snapshot entries"
  on public.phone_list_roster_entries;
create policy "Lead Command Board users can read roster snapshot entries"
  on public.phone_list_roster_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.phone_list_roster_snapshots snapshot
      where snapshot.id = phone_list_roster_entries.roster_snapshot_id
        and (
          public.user_is_department_admin(snapshot.department_id)
          or public.user_is_department_lead(snapshot.department_id)
          or public.user_is_command_center(snapshot.department_id)
        )
    )
  );

grant select on public.phone_list_roster_snapshots to authenticated;
grant select on public.phone_list_roster_entries to authenticated;

-- Bounded, authorization-protected History retrieval. Clinical shift start is
-- calculated from reporting_date + selected shift, never from entry time.
create or replace function public.list_shift_history(
  p_department_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_shift_type text default null,
  p_offset integer default 0,
  p_limit integer default 13
)
returns setof public.shift_status_updates
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not (
    public.user_is_department_admin(p_department_id)
    or public.user_is_department_lead(p_department_id)
    or public.user_is_command_center(p_department_id)
  ) then
    raise exception 'Shift History access is not permitted'
      using errcode = '42501';
  end if;

  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at then
    raise exception 'A valid History time range is required'
      using errcode = '22023';
  end if;

  if p_shift_type is not null and p_shift_type not in ('day', 'night') then
    raise exception 'The History shift filter is invalid'
      using errcode = '22023';
  end if;

  return query
  select update_row.*
  from public.shift_status_updates update_row
  cross join lateral (
    select
      (
        update_row.shift_date::timestamp
        + case
          when update_row.shift_type = 'day'::public.shift_status_shift_type then time '06:30'
          else time '18:30'
        end
      ) at time zone 'America/Los_Angeles' as clinical_start
  ) resolved
  where update_row.department_id = p_department_id
    and update_row.is_canonical = true
    and (p_shift_type is null or update_row.shift_type::text = p_shift_type)
    and resolved.clinical_start >= p_starts_at
    and resolved.clinical_start < p_ends_at
  order by resolved.clinical_start desc, update_row.id desc
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 50);
end;
$$;

revoke all on function public.list_shift_history(uuid, timestamptz, timestamptz, text, integer, integer)
  from public, anon;
grant execute on function public.list_shift_history(uuid, timestamptz, timestamptz, text, integer, integer)
  to authenticated, service_role;

create or replace function public.capture_phone_list_roster(
  p_department_id uuid,
  p_schedule_date date,
  p_shift_type text,
  p_assignments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  draft_id uuid;
  snapshot_id uuid;
  actor_profile_id uuid;
  actor_name text;
  record_options record;
begin
  select editable.day_shift_date, editable.night_shift_date
  into record_options
  from public.shift_status_record_options() editable;

  if not (
    (p_shift_type = 'day' and p_schedule_date = record_options.day_shift_date)
    or (p_shift_type = 'night' and p_schedule_date = record_options.night_shift_date)
  ) then
    raise exception 'Selected phone-list workspace is no longer editable'
      using errcode = '23514';
  end if;

  draft_id := public.save_phone_list_draft(
    p_department_id,
    p_schedule_date,
    p_shift_type,
    p_assignments
  );

  actor_profile_id := public.current_profile_id();
  select profile.display_name
  into actor_name
  from public.profiles profile
  where profile.id = actor_profile_id;

  insert into public.phone_list_roster_snapshots (
    department_id,
    shift_date,
    shift_type,
    captured_at,
    captured_by_profile_id,
    captured_by_name
  )
  values (
    p_department_id,
    p_schedule_date,
    p_shift_type::public.shift_status_shift_type,
    pg_catalog.now(),
    actor_profile_id,
    actor_name
  )
  on conflict (department_id, shift_date, shift_type)
  do update set
    captured_at = excluded.captured_at,
    captured_by_profile_id = excluded.captured_by_profile_id,
    captured_by_name = excluded.captured_by_name,
    updated_at = pg_catalog.now()
  returning id into snapshot_id;

  delete from public.phone_list_roster_entries entry
  where entry.roster_snapshot_id = snapshot_id;

  with populated as (
    select
      assignment.display_order,
      assignment.selected_staff_profile_id,
      assignment.staff_name_snapshot,
      assignment.row_label,
      case
        when assignment.selected_staff_profile_id is not null
          then 'staff:' || assignment.selected_staff_profile_id::text
        else 'manual:' || pg_catalog.lower(
          pg_catalog.regexp_replace(assignment.staff_name_snapshot, '\s+', ' ', 'g')
        )
      end as identity_key
    from public.phone_list_assignments assignment
    where assignment.phone_list_draft_id = draft_id
      and nullif(pg_catalog.btrim(assignment.staff_name_snapshot), '') is not null
  ),
  grouped as (
    select
      populated.identity_key,
      min(populated.display_order)::smallint as display_order,
      (array_agg(populated.selected_staff_profile_id order by populated.display_order)
        filter (where populated.selected_staff_profile_id is not null))[1] as staff_profile_id,
      (array_agg(populated.staff_name_snapshot order by populated.display_order))[1] as staff_display_name,
      array_agg(populated.row_label order by populated.display_order) as area_labels
    from populated
    group by populated.identity_key
  )
  insert into public.phone_list_roster_entries (
    roster_snapshot_id,
    display_order,
    staff_profile_id,
    staff_display_name,
    area_labels
  )
  select
    snapshot_id,
    grouped.display_order,
    grouped.staff_profile_id,
    grouped.staff_display_name,
    grouped.area_labels
  from grouped
  order by grouped.display_order;

  return snapshot_id;
end;
$$;

revoke all on function public.capture_phone_list_roster(uuid, date, text, jsonb)
  from public, anon;
grant execute on function public.capture_phone_list_roster(uuid, date, text, jsonb)
  to authenticated, service_role;

-- Shift Update may edit either Day or Night option currently offered by the
-- shared workspace mapping. The selected reporting date is authoritative.
create or replace function public.save_shift_status_update(shift_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_department_id uuid;
  target_shift_date date;
  target_shift_type public.shift_status_shift_type;
  record_options record;
  current_update public.shift_status_updates%rowtype;
  saved_id uuid;
begin
  if shift_payload is null or pg_catalog.jsonb_typeof(shift_payload) <> 'object' then
    raise exception 'Shift update payload is required'
      using errcode = '22023';
  end if;

  target_department_id := (shift_payload ->> 'department_id')::uuid;
  target_shift_date := (shift_payload ->> 'shift_date')::date;
  target_shift_type := (shift_payload ->> 'shift_type')::public.shift_status_shift_type;

  if target_department_id is null or target_shift_date is null or target_shift_type is null then
    raise exception 'Shift reporting record is required'
      using errcode = '23502';
  end if;

  if not (
    public.user_is_department_lead(target_department_id)
    or public.user_is_command_center(target_department_id)
  ) then
    raise exception 'Shift status update is not permitted'
      using errcode = '42501';
  end if;

  select editable.day_shift_date, editable.night_shift_date, editable.default_shift_type
  into record_options
  from public.shift_status_record_options() editable;

  if not (
    (target_shift_type = 'day'::public.shift_status_shift_type
      and target_shift_date = record_options.day_shift_date)
    or
    (target_shift_type = 'night'::public.shift_status_shift_type
      and target_shift_date = record_options.night_shift_date)
  ) then
    raise exception 'Selected shift record is no longer editable'
      using errcode = '23514';
  end if;

  if not (shift_payload ? 'updated_by_staff_profile_id')
     and not (shift_payload ? 'updated_by_name') then
    raise exception 'Shift status attribution is required'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_department_id::text || ':' || target_shift_date::text || ':' || target_shift_type::text,
      27027
    )
  );

  select update_row.*
  into current_update
  from public.shift_status_updates update_row
  where update_row.department_id = target_department_id
    and update_row.shift_date = target_shift_date
    and update_row.shift_type = target_shift_type
    and update_row.is_canonical = true
  limit 1
  for update;

  if found then
    update public.shift_status_updates update_row
    set
      rts_on = case
        when shift_payload ? 'rts_on' and shift_payload -> 'rts_on' <> 'null'::jsonb
          then (shift_payload ->> 'rts_on')::integer
        else current_update.rts_on
      end,
      rvu_total = case
        when shift_payload ? 'rvu_total' and shift_payload -> 'rvu_total' <> 'null'::jsonb
          then (shift_payload ->> 'rvu_total')::numeric
        else current_update.rvu_total
      end,
      vent_count = case
        when shift_payload ? 'vent_count' and shift_payload -> 'vent_count' <> 'null'::jsonb
          then (shift_payload ->> 'vent_count')::integer
        else current_update.vent_count
      end,
      bipap_count = case
        when shift_payload ? 'bipap_count' and shift_payload -> 'bipap_count' <> 'null'::jsonb
          then (shift_payload ->> 'bipap_count')::integer
        else current_update.bipap_count
      end,
      c_section_count = case
        when shift_payload ? 'c_section_count' and shift_payload -> 'c_section_count' <> 'null'::jsonb
          then (shift_payload ->> 'c_section_count')::integer
        else current_update.c_section_count
      end,
      vaginal_delivery_count = case
        when shift_payload ? 'vaginal_delivery_count' and shift_payload -> 'vaginal_delivery_count' <> 'null'::jsonb
          then (shift_payload ->> 'vaginal_delivery_count')::integer
        else current_update.vaginal_delivery_count
      end,
      cabg_count = case
        when shift_payload ? 'cabg_count' and shift_payload -> 'cabg_count' <> 'null'::jsonb
          then (shift_payload ->> 'cabg_count')::integer
        else current_update.cabg_count
      end,
      bronch_count = case
        when shift_payload ? 'bronch_count' and shift_payload -> 'bronch_count' <> 'null'::jsonb
          then (shift_payload ->> 'bronch_count')::integer
        else current_update.bronch_count
      end,
      sputum_induction_count = case
        when shift_payload ? 'sputum_induction_count' and shift_payload -> 'sputum_induction_count' <> 'null'::jsonb
          then (shift_payload ->> 'sputum_induction_count')::integer
        else current_update.sputum_induction_count
      end,
      other_procedure_count = case
        when shift_payload ? 'other_procedure_count' and shift_payload -> 'other_procedure_count' <> 'null'::jsonb
          then (shift_payload ->> 'other_procedure_count')::integer
        else current_update.other_procedure_count
      end,
      other_procedure_note = case
        when shift_payload ? 'other_procedure_note'
          then nullif(pg_catalog.btrim(shift_payload ->> 'other_procedure_note'), '')
        else current_update.other_procedure_note
      end,
      shift_note = case
        when shift_payload ? 'shift_note'
          then nullif(pg_catalog.btrim(shift_payload ->> 'shift_note'), '')
        else current_update.shift_note
      end,
      updated_by_staff_profile_id = case
        when shift_payload ? 'updated_by_staff_profile_id'
          then (shift_payload ->> 'updated_by_staff_profile_id')::uuid
        else current_update.updated_by_staff_profile_id
      end,
      updated_by_name = case
        when shift_payload ? 'updated_by_name'
          then nullif(pg_catalog.btrim(shift_payload ->> 'updated_by_name'), '')
        else current_update.updated_by_name
      end
    where update_row.id = current_update.id
    returning update_row.id into saved_id;
  else
    if not (shift_payload ? 'rts_on')
       or shift_payload -> 'rts_on' = 'null'::jsonb
       or not (shift_payload ? 'rvu_total')
       or shift_payload -> 'rvu_total' = 'null'::jsonb
       or not (shift_payload ? 'bipap_count')
       or shift_payload -> 'bipap_count' = 'null'::jsonb then
      raise exception 'RTs On Shift, RVUs, and BiPAPs are required'
        using errcode = '23502';
    end if;

    insert into public.shift_status_updates (
      department_id,
      shift_date,
      shift_type,
      is_canonical,
      rts_on,
      rts_required,
      rvu_total,
      vent_count,
      bipap_count,
      c_section_count,
      vaginal_delivery_count,
      cabg_count,
      bronch_count,
      sputum_induction_count,
      other_procedure_count,
      other_procedure_note,
      shift_note,
      updated_by_staff_profile_id,
      updated_by_name
    )
    values (
      target_department_id,
      target_shift_date,
      target_shift_type,
      true,
      (shift_payload ->> 'rts_on')::integer,
      0,
      (shift_payload ->> 'rvu_total')::numeric,
      case when shift_payload -> 'vent_count' = 'null'::jsonb then null else (shift_payload ->> 'vent_count')::integer end,
      (shift_payload ->> 'bipap_count')::integer,
      coalesce((shift_payload ->> 'c_section_count')::integer, 0),
      coalesce((shift_payload ->> 'vaginal_delivery_count')::integer, 0),
      coalesce((shift_payload ->> 'cabg_count')::integer, 0),
      coalesce((shift_payload ->> 'bronch_count')::integer, 0),
      coalesce((shift_payload ->> 'sputum_induction_count')::integer, 0),
      coalesce((shift_payload ->> 'other_procedure_count')::integer, 0),
      nullif(pg_catalog.btrim(shift_payload ->> 'other_procedure_note'), ''),
      nullif(pg_catalog.btrim(shift_payload ->> 'shift_note'), ''),
      (shift_payload ->> 'updated_by_staff_profile_id')::uuid,
      nullif(pg_catalog.btrim(shift_payload ->> 'updated_by_name'), '')
    )
    returning id into saved_id;
  end if;

  return saved_id;
end;
$$;

revoke all on function public.save_shift_status_update(jsonb)
  from public, anon;
grant execute on function public.save_shift_status_update(jsonb)
  to authenticated, service_role;
