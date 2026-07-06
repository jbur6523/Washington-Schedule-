create table if not exists public.department_orders (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_by_name text null,
  image_url text null,
  image_storage_path text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_orders_notes_length check (notes is null or char_length(notes) <= 280),
  constraint department_orders_image_or_note check (
    nullif(btrim(coalesce(image_storage_path, image_url, '')), '') is not null
    or nullif(btrim(coalesce(notes, '')), '') is not null
  )
);

create index if not exists department_orders_department_created_idx
  on public.department_orders(department_id, created_at desc);

create index if not exists department_orders_created_by_staff_idx
  on public.department_orders(created_by_staff_profile_id);

drop trigger if exists department_orders_set_updated_at on public.department_orders;
create trigger department_orders_set_updated_at
  before update on public.department_orders
  for each row execute function public.set_updated_at();

create or replace function public.user_is_department_aide(target_department_id uuid)
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
      and sp.operations_role = 'aide'
      and sp.is_active = true
  );
$$;

grant execute on function public.user_is_department_aide(uuid) to authenticated;

alter table public.department_orders enable row level security;

drop policy if exists "Aides can read department orders" on public.department_orders;
create policy "Aides can read department orders"
  on public.department_orders
  for select
  to authenticated
  using (public.user_is_department_aide(department_id));

drop policy if exists "Aides can create department orders" on public.department_orders;
create policy "Aides can create department orders"
  on public.department_orders
  for insert
  to authenticated
  with check (
    public.user_is_department_aide(department_id)
    and created_by_staff_profile_id = public.current_staff_profile_id(department_id)
  );

grant select, insert on public.department_orders to authenticated;

create or replace function public.department_order_storage_department_id(object_name text)
returns uuid
language sql
stable
as $$
  select case
    when (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(object_name))[1])::uuid
    else null
  end
$$;

grant execute on function public.department_order_storage_department_id(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'department-order-images',
  'department-order-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Aides can read department order images" on storage.objects;
create policy "Aides can read department order images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'department-order-images'
    and public.user_is_department_aide(public.department_order_storage_department_id(name))
  );

drop policy if exists "Aides can upload department order images" on storage.objects;
create policy "Aides can upload department order images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'department-order-images'
    and public.user_is_department_aide(public.department_order_storage_department_id(name))
  );
