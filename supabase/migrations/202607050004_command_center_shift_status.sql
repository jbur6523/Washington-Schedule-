alter table public.staff_profiles
  drop constraint if exists staff_profiles_operations_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_operations_role_check
  check (operations_role in ('none', 'aide', 'command_center', 'director'));

create or replace function public.user_is_command_center(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.department_id = target_department_id
      and sp.profile_id = public.current_profile_id()
      and sp.operations_role = 'command_center'
      and sp.is_active = true
  );
$$;

grant execute on function public.user_is_command_center(uuid) to authenticated;

create or replace function public.user_can_manage_rentals(target_department_id uuid)
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
      and dm.role in ('admin', 'lead')
  )
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.department_id = target_department_id
      and sp.profile_id = public.current_profile_id()
      and sp.operations_role in ('aide', 'command_center')
      and sp.is_active = true
  );
$$;

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
      or public.user_is_command_center(department_id)
    )
  );

drop policy if exists "Operations users can create rental events" on public.rental_events;
create policy "Operations users can create rental events"
  on public.rental_events
  for insert
  to authenticated
  with check (
    public.user_can_manage_rentals(department_id)
    and (
      actor_staff_profile_id = public.current_staff_profile_id(department_id)
      or public.user_is_command_center(department_id)
    )
  );

do $$
begin
  create type public.shift_status_shift_type as enum ('day', 'night');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.shift_status_updates (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  shift_date date not null,
  shift_type public.shift_status_shift_type not null,
  rts_on integer not null default 0,
  rts_required integer not null default 0,
  vent_count integer not null default 0,
  bipap_count integer not null default 0,
  c_section_count integer not null default 0,
  cabg_count integer not null default 0,
  bronch_count integer not null default 0,
  sputum_induction_count integer not null default 0,
  other_procedure_count integer not null default 0,
  other_procedure_note text,
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_status_counts_nonnegative check (
    rts_on >= 0
    and rts_required >= 0
    and vent_count >= 0
    and bipap_count >= 0
    and c_section_count >= 0
    and cabg_count >= 0
    and bronch_count >= 0
    and sputum_induction_count >= 0
    and other_procedure_count >= 0
  ),
  constraint shift_status_other_note_length check (other_procedure_note is null or char_length(other_procedure_note) <= 100),
  constraint shift_status_updated_by_name_length check (updated_by_name is null or char_length(updated_by_name) <= 120)
);

create index if not exists shift_status_updates_department_latest_idx
  on public.shift_status_updates(department_id, shift_date desc, shift_type, updated_at desc);

drop trigger if exists shift_status_updates_set_updated_at on public.shift_status_updates;
create trigger shift_status_updates_set_updated_at
  before update on public.shift_status_updates
  for each row execute function public.set_updated_at();

alter table public.shift_status_updates enable row level security;

drop policy if exists "Department members can read shift status updates" on public.shift_status_updates;
create policy "Department members can read shift status updates"
  on public.shift_status_updates
  for select
  to authenticated
  using (public.user_is_department_member(department_id));

drop policy if exists "Leads and command center can create shift status updates" on public.shift_status_updates;
create policy "Leads and command center can create shift status updates"
  on public.shift_status_updates
  for insert
  to authenticated
  with check (
    public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
  );

drop policy if exists "Department leads can manage shift shortages" on public.shift_shortages;
drop policy if exists "Leads and command center can manage shift shortages" on public.shift_shortages;
create policy "Leads and command center can manage shift shortages"
  on public.shift_shortages
  for all
  to authenticated
  using (
    public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
  )
  with check (
    public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
  );

insert into public.staff_profiles (
  department_id,
  display_name,
  username,
  username_normalized,
  assigned_role,
  operations_role,
  employment_type,
  home_assignment,
  is_active
)
select
  d.id,
  'Respiratory Command Center',
  'sputum',
  'sputum',
  'staff',
  'command_center',
  'full_time',
  'day_shift',
  true
from public.departments d
where not exists (
  select 1
  from public.staff_profiles sp
  where sp.department_id = d.id
    and sp.username_normalized = 'sputum'
);

update public.staff_profiles
set
  operations_role = 'command_center',
  assigned_role = 'staff',
  is_active = true,
  updated_at = now()
where username_normalized = 'sputum';

insert into public.staff_profiles (
  department_id,
  display_name,
  username,
  username_normalized,
  assigned_role,
  operations_role,
  employment_type,
  home_assignment,
  is_active
)
select
  d.id,
  'Director',
  'aloha',
  'aloha',
  'staff',
  'director',
  'full_time',
  'day_shift',
  true
from public.departments d
where not exists (
  select 1
  from public.staff_profiles sp
  where sp.department_id = d.id
    and sp.username_normalized = 'aloha'
);

update public.staff_profiles
set
  operations_role = 'director',
  assigned_role = 'staff',
  is_active = true,
  updated_at = now()
where username_normalized = 'aloha';
