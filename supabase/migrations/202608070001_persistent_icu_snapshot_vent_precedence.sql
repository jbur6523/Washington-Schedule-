-- The canonical Vent stream is persistent operational state. Its created_at is
-- the field-specific Vent update timestamp; shift metadata is retained only for
-- audit context and must not partition the current value.
create index if not exists official_vent_count_updates_department_latest_idx
  on public.official_vent_count_updates(department_id, created_at desc, id desc);

-- An omitted Vent value on a partial Lead update means "no change". Removing
-- the legacy zero default lets the publisher distinguish omission from a real
-- count of zero without changing the Lead Command Board's shift-scoped rows.
alter table public.shift_status_updates
  alter column vent_count drop default,
  alter column vent_count drop not null;

comment on column public.shift_status_updates.vent_count is
  'Optional Lead Vent field. NULL means no Vent update; zero is a valid count.';

-- Compare with the last value actually published by Lead across every shift.
-- Unrelated Lead saves, including the first save after rollover, therefore do
-- not acquire a newer Vent timestamp. ICU events remain independent and the
-- latest event from either source wins at read time.
create or replace function public.publish_lead_official_vent_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  previous_vent_count integer;
  previous_update_found boolean := false;
begin
  if new.vent_count is null then
    return new;
  end if;

  select update_row.vent_count, true
  into previous_vent_count, previous_update_found
  from public.official_vent_count_updates update_row
  where update_row.department_id = new.department_id
    and update_row.source = 'lead_command_center'
  order by update_row.created_at desc, update_row.id desc
  limit 1;

  if not previous_update_found
     or previous_vent_count is distinct from new.vent_count then
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

revoke all on function public.publish_lead_official_vent_count()
  from public, anon, authenticated;
