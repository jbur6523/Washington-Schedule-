alter table public.staff_profiles
  add column if not exists status_message text,
  add column if not exists status_updated_at timestamptz;

alter table public.staff_profiles
  drop constraint if exists staff_profiles_status_message_length_check;

alter table public.staff_profiles
  add constraint staff_profiles_status_message_length_check
  check (status_message is null or char_length(status_message) <= 100);
