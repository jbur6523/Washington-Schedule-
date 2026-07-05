alter table public.rental_records
  add column if not exists pickup_requested_at timestamptz,
  add column if not exists pickup_requested_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists pickup_confirmation_number text,
  add column if not exists pickup_request_note text,
  add column if not exists returned_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists return_note text;

alter table public.rental_records
  drop constraint if exists rental_records_pickup_confirmation_number_length;

alter table public.rental_records
  add constraint rental_records_pickup_confirmation_number_length
  check (pickup_confirmation_number is null or char_length(pickup_confirmation_number) <= 80);

alter table public.rental_records
  drop constraint if exists rental_records_pickup_request_note_length;

alter table public.rental_records
  add constraint rental_records_pickup_request_note_length
  check (pickup_request_note is null or char_length(pickup_request_note) <= 140);

alter table public.rental_records
  drop constraint if exists rental_records_return_note_length;

alter table public.rental_records
  add constraint rental_records_return_note_length
  check (return_note is null or char_length(return_note) <= 140);

create index if not exists rental_records_department_pickup_requested_idx
  on public.rental_records(department_id, pickup_requested_at desc);

create index if not exists rental_records_department_returned_idx
  on public.rental_records(department_id, returned_at desc);
