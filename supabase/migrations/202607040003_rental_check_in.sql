do $$
begin
  create type public.rental_equipment_type as enum ('bipap', 'v60');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.rental_record_status as enum ('active', 'returned', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.rental_event_type as enum (
    'checked_in',
    'manual_check_in',
    'barcode_scanned',
    'edited',
    'returned',
    'transferred'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.rental_vendors (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  phone_number text,
  notes text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_vendors_name_length check (char_length(name) between 1 and 120),
  constraint rental_vendors_notes_length check (notes is null or char_length(notes) <= 180),
  constraint rental_vendors_department_name_unique unique (department_id, name)
);

create table if not exists public.rental_equipment (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  vendor_id uuid references public.rental_vendors(id) on delete set null,
  equipment_type public.rental_equipment_type not null,
  serial_number text not null,
  last_known_company text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_equipment_serial_length check (char_length(serial_number) between 1 and 120),
  constraint rental_equipment_company_length check (last_known_company is null or char_length(last_known_company) <= 120),
  constraint rental_equipment_department_serial_unique unique (department_id, serial_number)
);

create table if not exists public.rental_records (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  equipment_id uuid not null references public.rental_equipment(id) on delete restrict,
  vendor_id uuid not null references public.rental_vendors(id) on delete restrict,
  equipment_type public.rental_equipment_type not null,
  serial_number text not null,
  status public.rental_record_status not null default 'active',
  checked_in_at timestamptz not null,
  checked_in_by_staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  checked_out_at timestamptz,
  returned_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_records_serial_length check (char_length(serial_number) between 1 and 120),
  constraint rental_records_notes_length check (notes is null or char_length(notes) <= 140)
);

create table if not exists public.rental_events (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  rental_record_id uuid references public.rental_records(id) on delete cascade,
  equipment_id uuid references public.rental_equipment(id) on delete set null,
  event_type public.rental_event_type not null,
  event_at timestamptz not null default now(),
  actor_staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rental_vendors_department_idx
  on public.rental_vendors(department_id, is_active, sort_order);

create index if not exists rental_equipment_department_serial_idx
  on public.rental_equipment(department_id, serial_number);

create index if not exists rental_records_department_status_idx
  on public.rental_records(department_id, status, checked_in_at desc);

create index if not exists rental_events_department_idx
  on public.rental_events(department_id, event_at desc);

drop trigger if exists rental_vendors_set_updated_at on public.rental_vendors;
create trigger rental_vendors_set_updated_at
  before update on public.rental_vendors
  for each row execute function public.set_updated_at();

drop trigger if exists rental_equipment_set_updated_at on public.rental_equipment;
create trigger rental_equipment_set_updated_at
  before update on public.rental_equipment
  for each row execute function public.set_updated_at();

drop trigger if exists rental_records_set_updated_at on public.rental_records;
create trigger rental_records_set_updated_at
  before update on public.rental_records
  for each row execute function public.set_updated_at();

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
      and sp.operations_role = 'aide'
      and sp.is_active = true
  );
$$;

grant execute on function public.user_can_manage_rentals(uuid) to authenticated;

alter table public.rental_vendors enable row level security;
alter table public.rental_equipment enable row level security;
alter table public.rental_records enable row level security;
alter table public.rental_events enable row level security;

drop policy if exists "Operations users can read rental vendors" on public.rental_vendors;
create policy "Operations users can read rental vendors"
  on public.rental_vendors
  for select
  to authenticated
  using (public.user_can_manage_rentals(department_id));

drop policy if exists "Admins can manage rental vendors" on public.rental_vendors;
create policy "Admins can manage rental vendors"
  on public.rental_vendors
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

drop policy if exists "Operations users can read rental equipment" on public.rental_equipment;
create policy "Operations users can read rental equipment"
  on public.rental_equipment
  for select
  to authenticated
  using (public.user_can_manage_rentals(department_id));

drop policy if exists "Operations users can manage rental equipment" on public.rental_equipment;
create policy "Operations users can manage rental equipment"
  on public.rental_equipment
  for all
  to authenticated
  using (public.user_can_manage_rentals(department_id))
  with check (public.user_can_manage_rentals(department_id));

drop policy if exists "Operations users can read rental records" on public.rental_records;
create policy "Operations users can read rental records"
  on public.rental_records
  for select
  to authenticated
  using (public.user_can_manage_rentals(department_id));

drop policy if exists "Operations users can create rental records" on public.rental_records;
create policy "Operations users can create rental records"
  on public.rental_records
  for insert
  to authenticated
  with check (
    public.user_can_manage_rentals(department_id)
    and checked_in_by_staff_profile_id = public.current_staff_profile_id(department_id)
  );

drop policy if exists "Admins can update rental records" on public.rental_records;
create policy "Admins can update rental records"
  on public.rental_records
  for update
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

drop policy if exists "Operations users can read rental events" on public.rental_events;
create policy "Operations users can read rental events"
  on public.rental_events
  for select
  to authenticated
  using (public.user_can_manage_rentals(department_id));

drop policy if exists "Operations users can create rental events" on public.rental_events;
create policy "Operations users can create rental events"
  on public.rental_events
  for insert
  to authenticated
  with check (
    public.user_can_manage_rentals(department_id)
    and actor_staff_profile_id = public.current_staff_profile_id(department_id)
  );

insert into public.rental_vendors (department_id, name, phone_number, notes, sort_order, is_active)
select d.id, vendor.name, vendor.phone_number, vendor.notes, vendor.sort_order, true
from public.departments d
cross join (
  values
    ('US Med Equipment', '877-677-7767', 'formerly Freedom', 10),
    ('Med One Capital', '510-380-8225', null, 20),
    ('Agiliti Health Inc', '510-279-3042', 'formerly UHS', 30),
    ('SRC', '800-669-5767', 'use only as last resort', 40),
    ('Other', null, null, 50)
) as vendor(name, phone_number, notes, sort_order)
on conflict (department_id, name) do update
set phone_number = excluded.phone_number,
    notes = excluded.notes,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();
