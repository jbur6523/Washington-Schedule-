alter table public.shift_status_updates
  add column if not exists vaginal_delivery_count integer not null default 0;

alter table public.shift_status_updates
  drop constraint if exists shift_status_vaginal_delivery_count_nonnegative;

alter table public.shift_status_updates
  add constraint shift_status_vaginal_delivery_count_nonnegative
  check (vaginal_delivery_count >= 0);
