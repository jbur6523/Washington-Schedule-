alter table public.notification_events
  add column if not exists recipient_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists read_at timestamptz,
  add column if not exists dismissed_at timestamptz;

update public.notification_events
set recipient_staff_profile_id = staff_profile_id
where recipient_staff_profile_id is null
  and staff_profile_id is not null;

create index if not exists notification_events_recipient_created_idx
  on public.notification_events(recipient_staff_profile_id, created_at desc);

create index if not exists notification_events_recipient_unread_idx
  on public.notification_events(recipient_staff_profile_id, read_at)
  where dismissed_at is null;

drop policy if exists "Staff can read their notification events" on public.notification_events;
drop policy if exists "Department admins can manage notification events" on public.notification_events;
drop policy if exists "Department members can create notification events" on public.notification_events;

create policy "Staff can read their own notification events"
  on public.notification_events
  for select
  to authenticated
  using (
    coalesce(recipient_staff_profile_id, staff_profile_id) = public.current_staff_profile_id(department_id)
  );

create policy "Staff can update their own notification events"
  on public.notification_events
  for update
  to authenticated
  using (
    coalesce(recipient_staff_profile_id, staff_profile_id) = public.current_staff_profile_id(department_id)
  )
  with check (
    coalesce(recipient_staff_profile_id, staff_profile_id) = public.current_staff_profile_id(department_id)
  );
