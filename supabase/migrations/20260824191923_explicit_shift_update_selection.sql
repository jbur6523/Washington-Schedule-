-- Shift Update now receives an explicit operational date and Day/Night shift
-- from the user. Keep the existing authorization, advisory lock, and one-row
-- canonical upsert, but remove the former 04:00/16:00 editable-window check.
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
