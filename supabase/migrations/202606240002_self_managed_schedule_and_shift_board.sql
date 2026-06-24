do $$
begin
  create type public.user_schedule_override_type as enum ('remove_self', 'add_self', 'move_self');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.shift_shortage_status as enum ('active', 'resolved', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.user_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  base_schedule_entry_id uuid references public.schedule_entries(id) on delete cascade,
  override_type public.user_schedule_override_type not null,
  shift_date date not null,
  shift_type text not null,
  shift_start time not null,
  shift_end time not null,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_schedule_overrides_note_length check (note is null or char_length(note) <= 140)
);

create index if not exists user_schedule_overrides_department_staff_idx
  on public.user_schedule_overrides(department_id, staff_profile_id, is_active);

create index if not exists user_schedule_overrides_base_entry_idx
  on public.user_schedule_overrides(base_schedule_entry_id)
  where base_schedule_entry_id is not null;

create unique index if not exists user_schedule_overrides_one_active_removal
  on public.user_schedule_overrides(base_schedule_entry_id, staff_profile_id)
  where is_active = true
    and override_type = 'remove_self'
    and base_schedule_entry_id is not null;

alter table public.shift_requests
  alter column schedule_entry_id drop not null,
  add column if not exists user_schedule_override_id uuid references public.user_schedule_overrides(id) on delete cascade;

alter table public.shift_requests
  drop constraint if exists shift_requests_one_target;

alter table public.shift_requests
  add constraint shift_requests_one_target check (
    (schedule_entry_id is not null and user_schedule_override_id is null)
    or (schedule_entry_id is null and user_schedule_override_id is not null)
  );

alter table public.shift_requests
  drop constraint if exists shift_requests_note_length;

alter table public.shift_requests
  add constraint shift_requests_note_length check (note is null or char_length(note) <= 140);

drop index if exists public.shift_requests_one_active_type_per_entry;

create unique index if not exists shift_requests_one_active_type_per_base_entry
  on public.shift_requests(schedule_entry_id, staff_profile_id, request_type)
  where status = 'active' and schedule_entry_id is not null;

create unique index if not exists shift_requests_one_active_type_per_override
  on public.shift_requests(user_schedule_override_id, staff_profile_id, request_type)
  where status = 'active' and user_schedule_override_id is not null;

alter table public.coverage_offers
  drop constraint if exists coverage_offers_note_length;

alter table public.coverage_offers
  add constraint coverage_offers_note_length check (note is null or char_length(note) <= 140);

create unique index if not exists coverage_offers_one_active_per_request_staff
  on public.coverage_offers(shift_request_id, offered_by_staff_profile_id)
  where status = 'offered' and shift_request_id is not null;

create unique index if not exists coverage_offers_one_active_per_shortage_staff
  on public.coverage_offers(shift_shortage_id, offered_by_staff_profile_id)
  where status = 'offered' and shift_shortage_id is not null;

alter table public.shift_shortages
  add column if not exists status public.shift_shortage_status not null default 'active',
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.shift_shortages
  drop constraint if exists shift_shortages_message_length;

alter table public.shift_shortages
  add constraint shift_shortages_message_length check (message is null or char_length(message) <= 140);

drop trigger if exists user_schedule_overrides_set_updated_at on public.user_schedule_overrides;
create trigger user_schedule_overrides_set_updated_at
  before update on public.user_schedule_overrides
  for each row execute function public.set_updated_at();

create or replace function public.user_is_department_lead_or_admin(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_memberships dm
    where dm.department_id = target_department_id
      and dm.profile_id = public.current_profile_id()
      and dm.role::text in ('admin', 'lead')
  );
$$;

grant execute on function public.user_is_department_lead_or_admin(uuid) to authenticated;

alter table public.user_schedule_overrides enable row level security;

create policy "Department members can read active schedule overrides"
  on public.user_schedule_overrides
  for select
  to authenticated
  using (
    public.user_is_department_member(department_id)
    and (
      is_active = true
      or staff_profile_id = public.current_staff_profile_id(department_id)
      or public.user_is_department_admin(department_id)
    )
  );

create policy "Staff can create their own schedule overrides"
  on public.user_schedule_overrides
  for insert
  to authenticated
  with check (
    public.user_is_department_member(department_id)
    and staff_profile_id = public.current_staff_profile_id(department_id)
    and is_active = true
  );

create policy "Staff can update their own schedule overrides"
  on public.user_schedule_overrides
  for update
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or staff_profile_id = public.current_staff_profile_id(department_id)
  )
  with check (
    public.user_is_department_admin(department_id)
    or staff_profile_id = public.current_staff_profile_id(department_id)
  );

create policy "Department admins can manage schedule overrides"
  on public.user_schedule_overrides
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

drop policy if exists "Members can read active shift shortages" on public.shift_shortages;

create policy "Members can read active shift shortages"
  on public.shift_shortages
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or (
      status = 'active'
      and public.user_is_department_member(department_id)
      and exists (
        select 1
        from public.schedule_versions sv
        join public.departments d on d.id = sv.department_id
        where sv.id = shift_shortages.schedule_version_id
          and sv.status = 'published'
          and d.active_schedule_version_id = sv.id
      )
    )
  );

drop policy if exists "Department leads can manage shift shortages" on public.shift_shortages;

create policy "Department leads can manage shift shortages"
  on public.shift_shortages
  for all
  to authenticated
  using (public.user_is_department_lead_or_admin(department_id))
  with check (public.user_is_department_lead_or_admin(department_id));
