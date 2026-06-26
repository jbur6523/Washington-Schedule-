alter table public.schedule_entries
  add column if not exists is_shift_lead boolean not null default false;

alter table public.schedule_import_rows
  add column if not exists is_shift_lead boolean not null default false;

create index if not exists schedule_entries_shift_lead_idx
  on public.schedule_entries(schedule_version_id, shift_date, shift_type)
  where is_shift_lead = true;
