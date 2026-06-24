do $$
begin
  create type public.shift_request_offer_type as enum ('coverage', 'switch');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.shift_request_offers (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  shift_request_id uuid not null references public.shift_requests(id) on delete cascade,
  offer_type public.shift_request_offer_type not null,
  offered_by_staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  offered_schedule_entry_id uuid references public.schedule_entries(id) on delete set null,
  offered_override_id uuid references public.user_schedule_overrides(id) on delete set null,
  offered_date date,
  offered_shift_type text,
  offered_shift_start time,
  offered_shift_end time,
  note text,
  status public.coverage_offer_status not null default 'offered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint shift_request_offers_note_length check (note is null or char_length(note) <= 140),
  constraint shift_request_offers_switch_target check (
    offer_type = 'coverage'
    or offered_schedule_entry_id is not null
    or offered_override_id is not null
    or (
      offered_date is not null
      and offered_shift_type is not null
      and offered_shift_start is not null
      and offered_shift_end is not null
    )
  )
);

create index if not exists shift_request_offers_department_idx
  on public.shift_request_offers(department_id, status);

create index if not exists shift_request_offers_request_idx
  on public.shift_request_offers(shift_request_id, status);

create unique index if not exists shift_request_offers_one_active_coverage
  on public.shift_request_offers(shift_request_id, offered_by_staff_profile_id, offer_type)
  where status = 'offered' and offer_type = 'coverage';

create unique index if not exists shift_request_offers_one_active_switch_entry
  on public.shift_request_offers(shift_request_id, offered_by_staff_profile_id, offered_schedule_entry_id)
  where status = 'offered' and offer_type = 'switch' and offered_schedule_entry_id is not null;

create unique index if not exists shift_request_offers_one_active_switch_override
  on public.shift_request_offers(shift_request_id, offered_by_staff_profile_id, offered_override_id)
  where status = 'offered' and offer_type = 'switch' and offered_override_id is not null;

create unique index if not exists shift_request_offers_one_active_switch_manual
  on public.shift_request_offers(
    shift_request_id,
    offered_by_staff_profile_id,
    offered_date,
    offered_shift_type,
    offered_shift_start,
    offered_shift_end
  )
  where status = 'offered'
    and offer_type = 'switch'
    and offered_schedule_entry_id is null
    and offered_override_id is null;

drop trigger if exists shift_request_offers_set_updated_at on public.shift_request_offers;
create trigger shift_request_offers_set_updated_at
  before update on public.shift_request_offers
  for each row execute function public.set_updated_at();

alter table public.shift_request_offers enable row level security;

create policy "Department members can read shift request offers"
  on public.shift_request_offers
  for select
  to authenticated
  using (public.user_is_department_member(department_id));

create policy "Staff can create their own shift request offers"
  on public.shift_request_offers
  for insert
  to authenticated
  with check (
    public.user_is_department_member(department_id)
    and offered_by_staff_profile_id = public.current_staff_profile_id(department_id)
    and status = 'offered'
  );

create policy "Offerers can update their own shift request offers"
  on public.shift_request_offers
  for update
  to authenticated
  using (
    offered_by_staff_profile_id = public.current_staff_profile_id(department_id)
    and status = 'offered'
  )
  with check (
    offered_by_staff_profile_id = public.current_staff_profile_id(department_id)
    and status in ('offered', 'cancelled')
  );

create policy "Request owners can respond to shift request offers"
  on public.shift_request_offers
  for update
  to authenticated
  using (
    status = 'offered'
    and exists (
      select 1
      from public.shift_requests sr
      where sr.id = shift_request_offers.shift_request_id
        and sr.staff_profile_id = public.current_staff_profile_id(shift_request_offers.department_id)
    )
  )
  with check (
    status in ('accepted', 'declined')
    and exists (
      select 1
      from public.shift_requests sr
      where sr.id = shift_request_offers.shift_request_id
        and sr.staff_profile_id = public.current_staff_profile_id(shift_request_offers.department_id)
    )
  );

create policy "Department admins can manage shift request offers"
  on public.shift_request_offers
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Department members can create notification events"
  on public.notification_events
  for insert
  to authenticated
  with check (
    public.user_is_department_member(department_id)
    and (
      staff_profile_id is null
      or public.user_is_department_member(department_id)
    )
  );
