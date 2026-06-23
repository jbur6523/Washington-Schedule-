create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('admin', 'staff');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.staff_employment_type as enum ('full_time', 'per_diem');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.staff_home_assignment as enum ('day_shift', 'night_shift', 'pft', 'pulmonary_rehab', 'flexible');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.preferred_contact_method as enum ('phone', 'email', 'app');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.schedule_version_status as enum ('draft', 'review', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.schedule_entry_status as enum ('scheduled', 'available');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.shift_shortage_severity as enum ('short', 'urgent');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.shift_request_type as enum ('switch_requested', 'coverage_requested');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.shift_request_status as enum ('active', 'cancelled', 'resolved');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.coverage_offer_status as enum ('offered', 'accepted', 'declined', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.schedule_import_status as enum ('uploaded', 'needs_review', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Los_Angeles',
  active_schedule_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, name)
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.department_memberships (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (department_id, profile_id)
);

create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  employment_type public.staff_employment_type not null,
  home_assignment public.staff_home_assignment not null,
  phone_number text,
  email text,
  preferred_contact_method public.preferred_contact_method,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, display_name)
);

create unique index if not exists staff_profiles_department_profile_unique
  on public.staff_profiles(department_id, profile_id)
  where profile_id is not null;

create table if not exists public.schedule_versions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  label text not null,
  starts_on date,
  ends_on date,
  status public.schedule_version_status not null default 'draft',
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.departments
  drop constraint if exists departments_active_schedule_version_id_fkey;

alter table public.departments
  add constraint departments_active_schedule_version_id_fkey
  foreign key (active_schedule_version_id)
  references public.schedule_versions(id)
  on delete set null;

create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  schedule_version_id uuid not null references public.schedule_versions(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  shift_date date not null,
  day_of_week text not null,
  shift_type text not null,
  shift_start time not null,
  shift_end time not null,
  entry_status public.schedule_entry_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedule_entries_version_date_idx
  on public.schedule_entries(schedule_version_id, shift_date, shift_start);

create table if not exists public.shift_shortages (
  id uuid primary key default gen_random_uuid(),
  schedule_version_id uuid not null references public.schedule_versions(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  shift_date date not null,
  shift_type text not null,
  shift_start time not null,
  shift_end time not null,
  severity public.shift_shortage_severity not null default 'short',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shift_requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  schedule_entry_id uuid not null references public.schedule_entries(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  request_type public.shift_request_type not null,
  status public.shift_request_status not null default 'active',
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists shift_requests_one_active_type_per_entry
  on public.shift_requests(schedule_entry_id, staff_profile_id, request_type)
  where status = 'active';

create table if not exists public.coverage_offers (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  shift_request_id uuid references public.shift_requests(id) on delete cascade,
  shift_shortage_id uuid references public.shift_shortages(id) on delete cascade,
  offered_by_staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  status public.coverage_offer_status not null default 'offered',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coverage_offers_one_target check (
    (shift_request_id is not null and shift_shortage_id is null)
    or (shift_request_id is null and shift_shortage_id is not null)
  )
);

create table if not exists public.schedule_imports (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  status public.schedule_import_status not null default 'uploaded',
  source_filename text,
  original_size_bytes integer,
  compressed_size_bytes integer,
  image_storage_path text,
  image_deleted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_import_rows (
  id uuid primary key default gen_random_uuid(),
  schedule_import_id uuid not null references public.schedule_imports(id) on delete cascade,
  row_index integer not null,
  shift_date date,
  day_of_week text,
  shift_type text,
  shift_time text,
  raw_staff_name text,
  matched_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  employment_type public.staff_employment_type,
  status public.schedule_entry_status,
  notes text,
  confidence numeric(5, 2),
  needs_review boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_import_id, row_index)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger staff_profiles_set_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

create trigger schedule_versions_set_updated_at
  before update on public.schedule_versions
  for each row execute function public.set_updated_at();

create trigger schedule_entries_set_updated_at
  before update on public.schedule_entries
  for each row execute function public.set_updated_at();

create trigger shift_shortages_set_updated_at
  before update on public.shift_shortages
  for each row execute function public.set_updated_at();

create trigger shift_requests_set_updated_at
  before update on public.shift_requests
  for each row execute function public.set_updated_at();

create trigger coverage_offers_set_updated_at
  before update on public.coverage_offers
  for each row execute function public.set_updated_at();

create trigger schedule_imports_set_updated_at
  before update on public.schedule_imports
  for each row execute function public.set_updated_at();

create trigger schedule_import_rows_set_updated_at
  before update on public.schedule_import_rows
  for each row execute function public.set_updated_at();

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.user_is_department_member(target_department_id uuid)
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
  );
$$;

create or replace function public.user_is_department_admin(target_department_id uuid)
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
      and dm.role = 'admin'
  );
$$;

create or replace function public.current_staff_profile_id(target_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sp.id
  from public.staff_profiles sp
  where sp.department_id = target_department_id
    and sp.profile_id = public.current_profile_id()
  limit 1;
$$;

grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.user_is_department_member(uuid) to authenticated;
grant execute on function public.user_is_department_admin(uuid) to authenticated;
grant execute on function public.current_staff_profile_id(uuid) to authenticated;

alter table public.hospitals enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.department_memberships enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.schedule_versions enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.shift_shortages enable row level security;
alter table public.shift_requests enable row level security;
alter table public.coverage_offers enable row level security;
alter table public.schedule_imports enable row level security;
alter table public.schedule_import_rows enable row level security;
alter table public.audit_events enable row level security;

create policy "Department members can read their hospital"
  on public.hospitals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.hospital_id = hospitals.id
        and public.user_is_department_member(d.id)
    )
  );

create policy "Department admins can update their hospital"
  on public.hospitals
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.hospital_id = hospitals.id
        and public.user_is_department_admin(d.id)
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      where d.hospital_id = hospitals.id
        and public.user_is_department_admin(d.id)
    )
  );

create policy "Department members can read departments"
  on public.departments
  for select
  to authenticated
  using (public.user_is_department_member(id));

create policy "Department admins can manage departments"
  on public.departments
  for all
  to authenticated
  using (public.user_is_department_admin(id))
  with check (public.user_is_department_admin(id));

create policy "Users can read their profile"
  on public.profiles
  for select
  to authenticated
  using (id = public.current_profile_id());

create policy "Department admins can read department profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.department_memberships dm
      where dm.profile_id = profiles.id
        and public.user_is_department_admin(dm.department_id)
    )
  );

create policy "Users can insert their profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth_user_id = auth.uid());

create policy "Users can update their profile"
  on public.profiles
  for update
  to authenticated
  using (id = public.current_profile_id())
  with check (id = public.current_profile_id());

create policy "Department members can read memberships"
  on public.department_memberships
  for select
  to authenticated
  using (public.user_is_department_member(department_id));

create policy "Department admins can manage memberships"
  on public.department_memberships
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Department members can read staff profiles"
  on public.staff_profiles
  for select
  to authenticated
  using (public.user_is_department_member(department_id));

create policy "Department admins can manage staff profiles"
  on public.staff_profiles
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Members can read published schedule versions"
  on public.schedule_versions
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or (
      status = 'published'
      and public.user_is_department_member(department_id)
      and exists (
        select 1
        from public.departments d
        where d.id = schedule_versions.department_id
          and d.active_schedule_version_id = schedule_versions.id
      )
    )
  );

create policy "Department admins can manage schedule versions"
  on public.schedule_versions
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Members can read active schedule entries"
  on public.schedule_entries
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or (
      public.user_is_department_member(department_id)
      and exists (
        select 1
        from public.schedule_versions sv
        join public.departments d on d.id = sv.department_id
        where sv.id = schedule_entries.schedule_version_id
          and sv.status = 'published'
          and d.active_schedule_version_id = sv.id
      )
    )
  );

create policy "Department admins can manage schedule entries"
  on public.schedule_entries
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Members can read active shift shortages"
  on public.shift_shortages
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or (
      public.user_is_department_member(department_id)
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

create policy "Department admins can manage shift shortages"
  on public.shift_shortages
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Department members can read shift requests"
  on public.shift_requests
  for select
  to authenticated
  using (public.user_is_department_member(department_id));

create policy "Staff can create their own shift requests"
  on public.shift_requests
  for insert
  to authenticated
  with check (
    public.user_is_department_member(department_id)
    and staff_profile_id = public.current_staff_profile_id(department_id)
    and status = 'active'
  );

create policy "Staff can cancel their own shift requests"
  on public.shift_requests
  for update
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or staff_profile_id = public.current_staff_profile_id(department_id)
  )
  with check (
    public.user_is_department_admin(department_id)
    or (
      staff_profile_id = public.current_staff_profile_id(department_id)
      and status in ('active', 'cancelled')
    )
  );

create policy "Department admins can manage shift requests"
  on public.shift_requests
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Department members can read coverage offers"
  on public.coverage_offers
  for select
  to authenticated
  using (public.user_is_department_member(department_id));

create policy "Staff can create their own coverage offers"
  on public.coverage_offers
  for insert
  to authenticated
  with check (
    public.user_is_department_member(department_id)
    and offered_by_staff_profile_id = public.current_staff_profile_id(department_id)
    and status = 'offered'
  );

create policy "Staff can cancel their own coverage offers"
  on public.coverage_offers
  for update
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or offered_by_staff_profile_id = public.current_staff_profile_id(department_id)
  )
  with check (
    public.user_is_department_admin(department_id)
    or (
      offered_by_staff_profile_id = public.current_staff_profile_id(department_id)
      and status in ('offered', 'cancelled')
    )
  );

create policy "Department admins can manage coverage offers"
  on public.coverage_offers
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Department admins can manage schedule imports"
  on public.schedule_imports
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Department admins can manage schedule import rows"
  on public.schedule_import_rows
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.schedule_imports si
      where si.id = schedule_import_rows.schedule_import_id
        and public.user_is_department_admin(si.department_id)
    )
  )
  with check (
    exists (
      select 1
      from public.schedule_imports si
      where si.id = schedule_import_rows.schedule_import_id
        and public.user_is_department_admin(si.department_id)
    )
  );

create policy "Department admins can read audit events"
  on public.audit_events
  for select
  to authenticated
  using (department_id is not null and public.user_is_department_admin(department_id));

create policy "Department admins can insert audit events"
  on public.audit_events
  for insert
  to authenticated
  with check (department_id is not null and public.user_is_department_admin(department_id));
