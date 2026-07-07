alter table public.staff_profiles
  drop constraint if exists staff_profiles_operations_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_operations_role_check
  check (operations_role in ('none', 'aide', 'command_center', 'director', 'icu_command_center'));

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

create or replace function public.user_is_department_director(target_department_id uuid)
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
      and sp.operations_role = 'director'
      and sp.is_active = true
  );
$$;

grant execute on function public.user_is_department_director(uuid) to authenticated;

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
  ventilator_outcome text,
  discontinued_at timestamptz,
  discontinued_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  is_active boolean not null default true,
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.icu_patients
  add column if not exists department_id uuid references public.departments(id) on delete cascade,
  add column if not exists bed text,
  add column if not exists device_type text,
  add column if not exists airway_size text,
  add column if not exists airway_at text,
  add column if not exists airway_location text,
  add column if not exists vent_mode text,
  add column if not exists rate numeric,
  add column if not exists tidal_volume numeric,
  add column if not exists peep numeric,
  add column if not exists fio2 numeric,
  add column if not exists ps numeric,
  add column if not exists t_high numeric,
  add column if not exists t_low numeric,
  add column if not exists p_high numeric,
  add column if not exists p_low numeric,
  add column if not exists percent_min_vol numeric,
  add column if not exists ipap numeric,
  add column if not exists epap numeric,
  add column if not exists cpap numeric,
  add column if not exists flow numeric,
  add column if not exists is_critical_vent boolean not null default false,
  add column if not exists ventilator_outcome text,
  add column if not exists discontinued_at timestamptz,
  add column if not exists discontinued_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'icu_patients_bed_length'
      and conrelid = 'public.icu_patients'::regclass
  ) then
    alter table public.icu_patients
      add constraint icu_patients_bed_length check (char_length(bed) between 1 and 20);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'icu_patients_device_type_check'
      and conrelid = 'public.icu_patients'::regclass
  ) then
    alter table public.icu_patients
      add constraint icu_patients_device_type_check check (device_type in ('vent', 'bipap', 'cpap', 'hfnc'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'icu_patients_airway_location_check'
      and conrelid = 'public.icu_patients'::regclass
  ) then
    alter table public.icu_patients
      add constraint icu_patients_airway_location_check check (airway_location is null or airway_location in ('teeth', 'gum', 'nare'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'icu_patients_vent_mode_check'
      and conrelid = 'public.icu_patients'::regclass
  ) then
    alter table public.icu_patients
      add constraint icu_patients_vent_mode_check check (vent_mode is null or vent_mode in ('apvcmv', 'scmv', 'spont', 'asv', 'pcmv', 'aprv'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'icu_patients_ventilator_outcome_check'
      and conrelid = 'public.icu_patients'::regclass
  ) then
    alter table public.icu_patients
      add constraint icu_patients_ventilator_outcome_check
      check (
        ventilator_outcome is null
        or ventilator_outcome in (
          'extubation',
          'trached_aerosol',
          'unplanned',
          'expired_on_ventilator',
          'transferred_to_another_facility',
          'donor_network',
          'discontinue_vent_support_palliative'
        )
      );
  end if;
end;
$$;

create index if not exists icu_patients_department_active_idx
  on public.icu_patients(department_id, is_active);

create index if not exists icu_patients_department_bed_idx
  on public.icu_patients(department_id, bed);

create index if not exists icu_patients_department_device_idx
  on public.icu_patients(department_id, device_type);

create index if not exists icu_patients_department_updated_idx
  on public.icu_patients(department_id, updated_at desc);

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

create table if not exists public.icu_patient_events (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  icu_patient_id uuid not null references public.icu_patients(id) on delete cascade,
  event_type text not null,
  event_time timestamptz not null default now(),
  event_summary text,
  event_data jsonb,
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

alter table public.icu_patient_events
  add column if not exists department_id uuid references public.departments(id) on delete cascade,
  add column if not exists icu_patient_id uuid references public.icu_patients(id) on delete cascade,
  add column if not exists event_type text,
  add column if not exists event_time timestamptz not null default now(),
  add column if not exists event_summary text,
  add column if not exists event_data jsonb,
  add column if not exists created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists created_by_name text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'icu_patient_events_type_check'
      and conrelid = 'public.icu_patient_events'::regclass
  ) then
    alter table public.icu_patient_events
      add constraint icu_patient_events_type_check check (
        event_type in ('added', 'updated', 'critical_status_updated', 'discontinued')
      );
  end if;
end;
$$;

create index if not exists icu_patient_events_patient_created_idx
  on public.icu_patient_events(icu_patient_id, created_at desc);

create index if not exists icu_patient_events_department_created_idx
  on public.icu_patient_events(department_id, created_at desc);

create index if not exists icu_patient_events_type_idx
  on public.icu_patient_events(event_type);

create index if not exists icu_patient_events_event_time_idx
  on public.icu_patient_events(event_time desc);

create index if not exists icu_patient_events_type_time_idx
  on public.icu_patient_events(event_type, event_time desc);

create index if not exists icu_patient_events_patient_time_idx
  on public.icu_patient_events(icu_patient_id, event_time desc);

alter table public.icu_patient_events enable row level security;

drop policy if exists "Authorized users can read ICU patient events" on public.icu_patient_events;
create policy "Authorized users can read ICU patient events"
  on public.icu_patient_events
  for select
  to authenticated
  using (public.user_can_view_icu_patients(department_id));

drop policy if exists "Authorized users can create ICU patient events" on public.icu_patient_events;
create policy "Authorized users can create ICU patient events"
  on public.icu_patient_events
  for insert
  to authenticated
  with check (public.user_can_manage_icu_patients(department_id));

create or replace function public.get_current_icu_snapshot_counts(target_department_id uuid)
returns table (
  vents integer,
  hfnc integer,
  bipap integer,
  cpap integer,
  critical_vents integer,
  total_active integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where ip.device_type = 'vent')::integer as vents,
    count(*) filter (where ip.device_type = 'hfnc')::integer as hfnc,
    count(*) filter (where ip.device_type = 'bipap')::integer as bipap,
    count(*) filter (where ip.device_type = 'cpap')::integer as cpap,
    count(*) filter (where ip.device_type = 'vent' and ip.is_critical_vent = true)::integer as critical_vents,
    count(*)::integer as total_active
  from public.icu_patients ip
  where ip.department_id = target_department_id
    and ip.is_active = true
  having public.user_is_department_member(target_department_id);
$$;

grant execute on function public.get_current_icu_snapshot_counts(uuid) to authenticated;
