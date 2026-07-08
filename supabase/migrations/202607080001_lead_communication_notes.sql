create table if not exists public.lead_communication_notes (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  note_text text not null,
  priority text not null default 'normal',
  status text not null default 'new',
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_by_name text null,
  reviewed_at timestamptz null,
  reviewed_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  reviewed_by_name text null,
  follow_up_text text null,
  followed_up_at timestamptz null,
  followed_up_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  followed_up_by_name text null,
  closed_at timestamptz null,
  closed_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  closed_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_communication_notes_note_length check (char_length(note_text) between 1 and 500),
  constraint lead_communication_notes_follow_up_length check (follow_up_text is null or char_length(follow_up_text) <= 500),
  constraint lead_communication_notes_priority_check check (priority in ('normal', 'urgent')),
  constraint lead_communication_notes_status_check check (status in ('new', 'reviewed', 'closed'))
);

create index if not exists lead_communication_notes_department_status_idx
  on public.lead_communication_notes(department_id, status);

create index if not exists lead_communication_notes_department_priority_idx
  on public.lead_communication_notes(department_id, priority);

create index if not exists lead_communication_notes_department_created_idx
  on public.lead_communication_notes(department_id, created_at desc);

create index if not exists lead_communication_notes_reviewed_idx
  on public.lead_communication_notes(department_id, reviewed_at desc);

drop trigger if exists lead_communication_notes_set_updated_at on public.lead_communication_notes;
create trigger lead_communication_notes_set_updated_at
  before update on public.lead_communication_notes
  for each row execute function public.set_updated_at();

alter table public.lead_communication_notes enable row level security;

drop policy if exists "Lead communication participants can read notes" on public.lead_communication_notes;
create policy "Lead communication participants can read notes"
  on public.lead_communication_notes
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
    or public.user_is_department_director(department_id)
    or public.user_is_icu_command_center(department_id)
  );

drop policy if exists "Lead communication participants can create notes" on public.lead_communication_notes;
create policy "Lead communication participants can create notes"
  on public.lead_communication_notes
  for insert
  to authenticated
  with check (
    (
      public.user_is_department_admin(department_id)
      or public.user_is_department_lead(department_id)
      or public.user_is_command_center(department_id)
      or public.user_is_department_director(department_id)
      or public.user_is_icu_command_center(department_id)
    )
    and created_by_staff_profile_id = public.current_staff_profile_id(department_id)
    and status = 'new'
  );

drop policy if exists "Leads and admins can update lead communication notes" on public.lead_communication_notes;
create policy "Leads and admins can update lead communication notes"
  on public.lead_communication_notes
  for update
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or public.user_is_department_lead(department_id)
  )
  with check (
    public.user_is_department_admin(department_id)
    or public.user_is_department_lead(department_id)
  );

grant select, insert, update on public.lead_communication_notes to authenticated;
