create table if not exists public.gossip_posts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  body text null,
  image_path text null,
  image_width integer null,
  image_height integer null,
  image_size_bytes integer null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz null,
  constraint gossip_posts_body_length check (body is null or char_length(body) <= 140),
  constraint gossip_posts_body_or_image check (
    nullif(btrim(coalesce(body, '')), '') is not null
    or nullif(btrim(coalesce(image_path, '')), '') is not null
  )
);

create index if not exists gossip_posts_department_created_idx
  on public.gossip_posts(department_id, created_at desc)
  where is_deleted = false;

create index if not exists gossip_posts_staff_profile_idx
  on public.gossip_posts(staff_profile_id);

drop trigger if exists gossip_posts_set_updated_at on public.gossip_posts;
create trigger gossip_posts_set_updated_at
  before update on public.gossip_posts
  for each row execute function public.set_updated_at();

alter table public.gossip_posts enable row level security;

drop policy if exists "Department members can read gossip posts" on public.gossip_posts;
create policy "Department members can read gossip posts"
  on public.gossip_posts
  for select
  to authenticated
  using (
    is_deleted = false
    and public.user_is_department_member(department_id)
  );

drop policy if exists "Staff can create their gossip posts" on public.gossip_posts;
create policy "Staff can create their gossip posts"
  on public.gossip_posts
  for insert
  to authenticated
  with check (
    public.user_is_department_member(department_id)
    and staff_profile_id = public.current_staff_profile_id(department_id)
  );

drop policy if exists "Staff can update their gossip posts" on public.gossip_posts;
create policy "Staff can update their gossip posts"
  on public.gossip_posts
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

drop policy if exists "Staff can delete their gossip posts" on public.gossip_posts;
create policy "Staff can delete their gossip posts"
  on public.gossip_posts
  for delete
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or staff_profile_id = public.current_staff_profile_id(department_id)
  );

grant select, insert, update, delete on public.gossip_posts to authenticated;

create or replace function public.gossip_storage_department_id(object_name text)
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

grant execute on function public.gossip_storage_department_id(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gossip-images',
  'gossip-images',
  false,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Department members can read gossip images" on storage.objects;
create policy "Department members can read gossip images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'gossip-images'
    and public.user_is_department_member(public.gossip_storage_department_id(name))
  );

drop policy if exists "Department members can upload gossip images" on storage.objects;
create policy "Department members can upload gossip images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'gossip-images'
    and public.user_is_department_member(public.gossip_storage_department_id(name))
  );

drop policy if exists "Department members can update gossip images" on storage.objects;
create policy "Department members can update gossip images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'gossip-images'
    and public.user_is_department_member(public.gossip_storage_department_id(name))
  )
  with check (
    bucket_id = 'gossip-images'
    and public.user_is_department_member(public.gossip_storage_department_id(name))
  );

drop policy if exists "Department members can delete gossip images" on storage.objects;
create policy "Department members can delete gossip images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'gossip-images'
    and public.user_is_department_member(public.gossip_storage_department_id(name))
  );
