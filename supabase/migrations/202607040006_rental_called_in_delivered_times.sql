alter type public.rental_record_status add value if not exists 'pending_delivery';
alter type public.rental_record_status add value if not exists 'called_in';
alter type public.rental_record_status add value if not exists 'delivered';

alter type public.rental_event_type add value if not exists 'called_in';
alter type public.rental_event_type add value if not exists 'delivered';
alter type public.rental_event_type add value if not exists 'pending_delivery';
alter type public.rental_event_type add value if not exists 'pickup_requested';
alter type public.rental_event_type add value if not exists 'pickup_called';
alter type public.rental_event_type add value if not exists 'picked_up';

alter table public.rental_records
  add column if not exists called_in_at timestamptz,
  add column if not exists called_in_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists called_in_by_name text;

alter table public.rental_records
  alter column equipment_id drop not null,
  alter column serial_number drop not null,
  alter column checked_in_at drop not null,
  alter column checked_in_by_staff_profile_id drop not null;

alter table public.rental_records
  drop constraint if exists rental_records_serial_length;

alter table public.rental_records
  add constraint rental_records_serial_length
  check (serial_number is null or char_length(serial_number) between 1 and 120);

alter table public.rental_records
  drop constraint if exists rental_records_called_in_by_name_length;

alter table public.rental_records
  add constraint rental_records_called_in_by_name_length
  check (called_in_by_name is null or char_length(called_in_by_name) <= 120);

create index if not exists rental_records_department_called_in_idx
  on public.rental_records(department_id, called_in_at desc);

drop policy if exists "Operations users can create rental records" on public.rental_records;
create policy "Operations users can create rental records"
  on public.rental_records
  for insert
  to authenticated
  with check (
    public.user_can_manage_rentals(department_id)
    and (
      checked_in_by_staff_profile_id = public.current_staff_profile_id(department_id)
      or called_in_by_staff_profile_id = public.current_staff_profile_id(department_id)
    )
  );

drop policy if exists "Admins can update rental records" on public.rental_records;
drop policy if exists "Operations users can update rental records" on public.rental_records;
create policy "Operations users can update rental records"
  on public.rental_records
  for update
  to authenticated
  using (public.user_can_manage_rentals(department_id))
  with check (public.user_can_manage_rentals(department_id));
