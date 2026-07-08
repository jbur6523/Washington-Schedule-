create table if not exists public.rt_aide_notes (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  note_text text not null,
  priority text not null default 'normal',
  status text not null default 'new',
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_by_name text null,
  acknowledged_at timestamptz null,
  acknowledged_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  acknowledged_by_name text null,
  response_text text null,
  responded_at timestamptz null,
  responded_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  responded_by_name text null,
  closed_at timestamptz null,
  closed_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  closed_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rt_aide_notes_note_length check (char_length(note_text) between 1 and 500),
  constraint rt_aide_notes_response_length check (response_text is null or char_length(response_text) <= 500),
  constraint rt_aide_notes_priority_check check (priority in ('normal', 'urgent')),
  constraint rt_aide_notes_status_check check (status in ('new', 'acknowledged', 'responded', 'closed'))
);

create index if not exists rt_aide_notes_department_status_idx
  on public.rt_aide_notes(department_id, status);

create index if not exists rt_aide_notes_department_created_idx
  on public.rt_aide_notes(department_id, created_at desc);

create index if not exists rt_aide_notes_acknowledged_idx
  on public.rt_aide_notes(department_id, acknowledged_at desc);

create index if not exists rt_aide_notes_responded_idx
  on public.rt_aide_notes(department_id, responded_at desc);

drop trigger if exists rt_aide_notes_set_updated_at on public.rt_aide_notes;
create trigger rt_aide_notes_set_updated_at
  before update on public.rt_aide_notes
  for each row execute function public.set_updated_at();

create or replace function public.user_is_department_lead(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_memberships dm
    join public.staff_profiles sp
      on sp.department_id = dm.department_id
      and sp.profile_id = dm.profile_id
    where dm.department_id = target_department_id
      and dm.profile_id = public.current_profile_id()
      and dm.role = 'lead'
      and sp.is_active = true
  );
$$;

grant execute on function public.user_is_department_lead(uuid) to authenticated;

alter table public.rt_aide_notes enable row level security;

drop policy if exists "RT Aide note participants can read notes" on public.rt_aide_notes;
create policy "RT Aide note participants can read notes"
  on public.rt_aide_notes
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
    or public.user_is_department_aide(department_id)
  );

drop policy if exists "RT Command Center users can create aide notes" on public.rt_aide_notes;
create policy "RT Command Center users can create aide notes"
  on public.rt_aide_notes
  for insert
  to authenticated
  with check (
    (
      public.user_is_department_admin(department_id)
      or public.user_is_department_lead(department_id)
      or public.user_is_command_center(department_id)
    )
    and created_by_staff_profile_id = public.current_staff_profile_id(department_id)
    and status = 'new'
  );

drop policy if exists "Aides and admins can update aide notes" on public.rt_aide_notes;
create policy "Aides and admins can update aide notes"
  on public.rt_aide_notes
  for update
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or public.user_is_department_aide(department_id)
  )
  with check (
    public.user_is_department_admin(department_id)
    or public.user_is_department_aide(department_id)
  );

grant select, insert, update on public.rt_aide_notes to authenticated;
