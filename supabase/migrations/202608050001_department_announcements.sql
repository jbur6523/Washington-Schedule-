create table if not exists public.department_announcements (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  title text not null,
  message text not null,
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  updated_by_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint department_announcements_department_unique unique (department_id),
  constraint department_announcements_title_check
    check (title = btrim(title) and char_length(title) between 1 and 120),
  constraint department_announcements_message_check
    check (message = btrim(message) and char_length(message) between 1 and 2000),
  constraint department_announcements_updated_by_name_check
    check (updated_by_name = btrim(updated_by_name) and char_length(updated_by_name) between 1 and 120)
);

create index if not exists department_announcements_updated_idx
  on public.department_announcements(department_id, updated_at desc);

drop trigger if exists department_announcements_set_updated_at
  on public.department_announcements;
create trigger department_announcements_set_updated_at
  before update on public.department_announcements
  for each row execute function public.set_updated_at();

create or replace function public.set_department_announcement_attribution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_staff_profile_id uuid;
  actor_name text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if not (
    public.user_is_department_lead(new.department_id)
    or public.user_is_command_center(new.department_id)
    or public.user_is_department_director(new.department_id)
  ) then
    raise exception 'Announcement management access is required.'
      using errcode = '42501';
  end if;

  actor_staff_profile_id := public.current_staff_profile_id(new.department_id);

  select staff.display_name
    into actor_name
  from public.staff_profiles staff
  where staff.id = actor_staff_profile_id
    and staff.department_id = new.department_id
    and staff.is_active = true;

  if actor_staff_profile_id is null or actor_name is null then
    raise exception 'An active department staff profile is required.'
      using errcode = '42501';
  end if;

  new.updated_by_staff_profile_id := actor_staff_profile_id;
  new.updated_by_name := actor_name;
  return new;
end;
$$;

revoke all on function public.set_department_announcement_attribution() from public;
revoke all on function public.set_department_announcement_attribution() from authenticated;

drop trigger if exists department_announcements_set_attribution
  on public.department_announcements;
create trigger department_announcements_set_attribution
  before insert or update on public.department_announcements
  for each row execute function public.set_department_announcement_attribution();

alter table public.department_announcements enable row level security;
alter table public.department_announcements replica identity full;

drop policy if exists "Department members can read announcements"
  on public.department_announcements;
create policy "Department members can read announcements"
  on public.department_announcements
  for select
  to authenticated
  using (public.user_is_department_member(department_id));

drop policy if exists "Lead and director users can create announcements"
  on public.department_announcements;
create policy "Lead and director users can create announcements"
  on public.department_announcements
  for insert
  to authenticated
  with check (
    public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
    or public.user_is_department_director(department_id)
  );

drop policy if exists "Lead and director users can update announcements"
  on public.department_announcements;
create policy "Lead and director users can update announcements"
  on public.department_announcements
  for update
  to authenticated
  using (
    public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
    or public.user_is_department_director(department_id)
  )
  with check (
    public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
    or public.user_is_department_director(department_id)
  );

drop policy if exists "Lead and director users can clear announcements"
  on public.department_announcements;
create policy "Lead and director users can clear announcements"
  on public.department_announcements
  for delete
  to authenticated
  using (
    public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
    or public.user_is_department_director(department_id)
  );

revoke all on table public.department_announcements from public;
grant select, insert, update, delete on table public.department_announcements to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication publication
    where publication.pubname = 'supabase_realtime'
      and publication.puballtables = false
  )
  and not exists (
    select 1
    from pg_catalog.pg_publication_tables published_table
    where published_table.pubname = 'supabase_realtime'
      and published_table.schemaname = 'public'
      and published_table.tablename = 'department_announcements'
  ) then
    alter publication supabase_realtime
      add table public.department_announcements;
  end if;
end;
$$;
