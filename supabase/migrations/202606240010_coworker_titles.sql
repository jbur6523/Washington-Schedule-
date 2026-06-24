do $$
begin
  create type public.coworker_title as enum (
    'bestie',
    'work_wife',
    'work_husband',
    'ride_or_die',
    'emotional_support_coworker',
    'frenemy',
    'trauma_bonded'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.coworker_titles (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  owner_staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  target_staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  title public.coworker_title not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coworker_titles_no_self_tag
    check (owner_staff_profile_id <> target_staff_profile_id)
);

create unique index if not exists coworker_titles_unique_owner_target_title
  on public.coworker_titles(department_id, owner_staff_profile_id, target_staff_profile_id, title);

drop trigger if exists coworker_titles_set_updated_at on public.coworker_titles;
create trigger coworker_titles_set_updated_at
  before update on public.coworker_titles
  for each row execute function public.set_updated_at();

alter table public.coworker_titles enable row level security;

drop policy if exists "Users can read their coworker titles" on public.coworker_titles;
create policy "Users can read their coworker titles"
  on public.coworker_titles
  for select
  to authenticated
  using (
    public.user_is_department_member(department_id)
    and owner_staff_profile_id = public.current_staff_profile_id(department_id)
  );

drop policy if exists "Users can create their coworker titles" on public.coworker_titles;
create policy "Users can create their coworker titles"
  on public.coworker_titles
  for insert
  to authenticated
  with check (
    public.user_is_department_member(department_id)
    and owner_staff_profile_id = public.current_staff_profile_id(department_id)
    and owner_staff_profile_id <> target_staff_profile_id
    and exists (
      select 1
      from public.staff_profiles target
      where target.id = coworker_titles.target_staff_profile_id
        and target.department_id = coworker_titles.department_id
    )
  );

drop policy if exists "Users can update their coworker titles" on public.coworker_titles;
create policy "Users can update their coworker titles"
  on public.coworker_titles
  for update
  to authenticated
  using (
    public.user_is_department_member(department_id)
    and owner_staff_profile_id = public.current_staff_profile_id(department_id)
  )
  with check (
    public.user_is_department_member(department_id)
    and owner_staff_profile_id = public.current_staff_profile_id(department_id)
    and owner_staff_profile_id <> target_staff_profile_id
    and exists (
      select 1
      from public.staff_profiles target
      where target.id = coworker_titles.target_staff_profile_id
        and target.department_id = coworker_titles.department_id
    )
  );

drop policy if exists "Users can delete their coworker titles" on public.coworker_titles;
create policy "Users can delete their coworker titles"
  on public.coworker_titles
  for delete
  to authenticated
  using (
    public.user_is_department_member(department_id)
    and owner_staff_profile_id = public.current_staff_profile_id(department_id)
  );

grant usage on type public.coworker_title to authenticated;
grant select, insert, update, delete on public.coworker_titles to authenticated;
