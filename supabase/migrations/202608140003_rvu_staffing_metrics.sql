-- Persist exact Shift Update RVUs on the existing reporting-window record.
-- Existing rows remain unchanged with a NULL rvu_total.
alter table public.shift_status_updates
  add column if not exists rvu_total numeric;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.shift_status_updates'::regclass
      and conname = 'shift_status_rvu_total_valid'
  ) then
    alter table public.shift_status_updates
      add constraint shift_status_rvu_total_valid
      check (
        rvu_total is null
        or (
          rvu_total >= 0
          and rvu_total::text not in ('NaN', 'Infinity', '-Infinity')
        )
      );
  end if;
end;
$$;

comment on column public.shift_status_updates.rvu_total is
  'Exact raw RVU total entered for this reporting window. NULL means historical RVU data is unavailable.';

-- This is the database counterpart of the shared 04:00/16:00 Pacific window
-- used by the application. The reporting date for 00:00-03:59 is the prior day.
create or replace function public.current_shift_reporting_window()
returns table (
  shift_date date,
  shift_type public.shift_status_shift_type
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
      when local_now::time >= time '04:00' and local_now::time < time '16:00'
        then 'day'::public.shift_status_shift_type
      else 'night'::public.shift_status_shift_type
    end
  from pacific_now;
$$;

revoke all on function public.current_shift_reporting_window()
  from public, anon;
grant execute on function public.current_shift_reporting_window()
  to authenticated, service_role;

-- Raw RVUs are authoritative. Every insert or update with RVU data derives the
-- existing downstream staffing field on the server using normal rounding.
create or replace function public.enforce_shift_status_rvu_calculation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.rvu_total is not null then
    if new.rvu_total < 0
       or new.rvu_total::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'RVUs must be a finite number of 0 or more'
        using errcode = '23514';
    end if;

    new.rts_required := pg_catalog.round(new.rvu_total / 27, 1);
  end if;

  return new;
end;
$$;

drop trigger if exists shift_status_updates_calculate_rts_needed
  on public.shift_status_updates;
create trigger shift_status_updates_calculate_rts_needed
  before insert or update on public.shift_status_updates
  for each row
  execute function public.enforce_shift_status_rvu_calculation();

revoke all on function public.enforce_shift_status_rvu_calculation()
  from public, anon, authenticated;

-- Corrections inside one reporting window update the latest canonical row.
-- The JSON payload also makes omitted fields explicit so partial saves preserve
-- existing staffing and operational data instead of replacing it with defaults.
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
  active_window record;
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
    raise exception 'Shift reporting window is required'
      using errcode = '23502';
  end if;

  if not (
    public.user_is_department_lead(target_department_id)
    or public.user_is_command_center(target_department_id)
  ) then
    raise exception 'Shift status update is not permitted'
      using errcode = '42501';
  end if;

  select reporting_window.shift_date, reporting_window.shift_type
  into active_window
  from public.current_shift_reporting_window() reporting_window;

  if target_shift_date is distinct from active_window.shift_date
     or target_shift_type is distinct from active_window.shift_type then
    raise exception 'Shift reporting window is no longer active'
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
  order by update_row.created_at desc, update_row.id desc
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

-- Existing direct inserts stay compatible during rollout. Canonical RPC saves
-- also run attribution and Vent publication when correcting the active row.
drop trigger if exists shift_status_updates_enforce_attribution
  on public.shift_status_updates;
create trigger shift_status_updates_enforce_attribution
  before insert or update on public.shift_status_updates
  for each row
  execute function public.enforce_shift_status_attribution();

drop trigger if exists shift_status_updates_publish_official_vent
  on public.shift_status_updates;
create trigger shift_status_updates_publish_official_vent
  after insert or update on public.shift_status_updates
  for each row
  execute function public.publish_lead_official_vent_count();
