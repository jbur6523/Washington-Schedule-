alter table public.schedule_import_rows
  add column if not exists shift_start time,
  add column if not exists shift_end time,
  add column if not exists validation_status text,
  add column if not exists removed_at timestamptz;

create index if not exists schedule_import_rows_import_review_idx
  on public.schedule_import_rows(schedule_import_id, needs_review, row_index);
