alter type public.rental_record_status add value if not exists 'called_for_pickup';
alter type public.rental_record_status add value if not exists 'delivery_cancelled';

alter type public.rental_event_type add value if not exists 'delivery_cancelled';
alter type public.rental_event_type add value if not exists 'pickup_cancelled';

alter table public.rental_records
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists cancellation_note text;

alter table public.rental_records
  drop constraint if exists rental_records_cancellation_note_length;

alter table public.rental_records
  add constraint rental_records_cancellation_note_length
  check (cancellation_note is null or char_length(cancellation_note) <= 140);

create index if not exists rental_records_department_cancelled_idx
  on public.rental_records(department_id, cancelled_at desc);
