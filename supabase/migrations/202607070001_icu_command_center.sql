alter table public.staff_profiles
  drop constraint if exists staff_profiles_operations_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_operations_role_check
  check (operations_role in ('none', 'aide', 'command_center', 'director', 'icu_command_center'));

create or replace function public.user_is_icu_command_center(target_department_id uuid)
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
      and sp.operations_role = 'icu_command_center'
      and sp.is_active = true
  );
$$;

grant execute on function public.user_is_icu_command_center(uuid) to authenticated;

create or replace function public.user_can_manage_icu_patients(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_is_department_admin(target_department_id)
    or public.user_is_icu_command_center(target_department_id);
$$;

grant execute on function public.user_can_manage_icu_patients(uuid) to authenticated;

create or replace function public.user_can_view_icu_patients(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_manage_icu_patients(target_department_id)
    or public.user_is_department_director(target_department_id)
    or public.user_is_command_center(target_department_id);
$$;

grant execute on function public.user_can_view_icu_patients(uuid) to authenticated;

create table if not exists public.icu_patients (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  bed text not null,
  device_type text not null,
  airway_size text,
  airway_at text,
  airway_location text,
  vent_mode text,
  rate numeric,
  tidal_volume numeric,
  peep numeric,
  fio2 numeric,
  ps numeric,
  t_high numeric,
  t_low numeric,
  p_high numeric,
  p_low numeric,
  percent_min_vol numeric,
  ipap numeric,
  epap numeric,
  cpap numeric,
  flow numeric,
  is_critical_vent boolean not null default false,
  is_active boolean not null default true,
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint icu_patients_bed_length check (char_length(bed) between 1 and 20),
  constraint icu_patients_device_type_check check (device_type in ('vent', 'bipap', 'cpap', 'hfnc')),
  constraint icu_patients_airway_location_check check (airway_location is null or airway_location in ('teeth', 'gum', 'nare')),
  constraint icu_patients_vent_mode_check check (vent_mode is null or vent_mode in ('apvcmv', 'scmv', 'spont', 'asv', 'pcmv', 'aprv')),
  constraint icu_patients_nonnegative_settings check (
    (rate is null or rate >= 0)
    and (tidal_volume is null or tidal_volume >= 0)
    and (peep is null or peep >= 0)
    and (fio2 is null or fio2 >= 0)
    and (ps is null or ps >= 0)
    and (t_high is null or t_high >= 0)
    and (t_low is null or t_low >= 0)
    and (p_high is null or p_high >= 0)
    and (p_low is null or p_low >= 0)
    and (percent_min_vol is null or percent_min_vol >= 0)
    and (ipap is null or ipap >= 0)
    and (epap is null or epap >= 0)
    and (cpap is null or cpap >= 0)
    and (flow is null or flow >= 0)
  )
);

create index if not exists icu_patients_department_active_idx
  on public.icu_patients(department_id, is_active);

create index if not exists icu_patients_department_bed_idx
  on public.icu_patients(department_id, bed);

create index if not exists icu_patients_department_device_idx
  on public.icu_patients(department_id, device_type);

create index if not exists icu_patients_department_updated_idx
  on public.icu_patients(department_id, updated_at desc);

create unique index if not exists icu_patients_one_active_per_bed_idx
  on public.icu_patients(department_id, bed)
  where is_active = true;

drop trigger if exists icu_patients_set_updated_at on public.icu_patients;
create trigger icu_patients_set_updated_at
  before update on public.icu_patients
  for each row execute function public.set_updated_at();

alter table public.icu_patients enable row level security;

drop policy if exists "Authorized users can read ICU patients" on public.icu_patients;
create policy "Authorized users can read ICU patients"
  on public.icu_patients
  for select
  to authenticated
  using (public.user_can_view_icu_patients(department_id));

drop policy if exists "Authorized users can create ICU patients" on public.icu_patients;
create policy "Authorized users can create ICU patients"
  on public.icu_patients
  for insert
  to authenticated
  with check (public.user_can_manage_icu_patients(department_id));

drop policy if exists "Authorized users can update ICU patients" on public.icu_patients;
create policy "Authorized users can update ICU patients"
  on public.icu_patients
  for update
  to authenticated
  using (public.user_can_manage_icu_patients(department_id))
  with check (public.user_can_manage_icu_patients(department_id));

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
  'ICU Command Center',
  'ventilator',
  'ventilator',
  'staff',
  'icu_command_center',
  'full_time',
  'rt_aide',
  true
from public.departments d
where not exists (
  select 1
  from public.staff_profiles sp
  where sp.department_id = d.id
    and sp.username_normalized = 'ventilator'
);

update public.staff_profiles
set
  operations_role = 'icu_command_center',
  assigned_role = 'staff',
  is_active = true,
  updated_at = now()
where username_normalized = 'ventilator';
