do $$
begin
  create type public.notification_delivery_status as enum ('queued', 'sent', 'failed', 'skipped');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  platform text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (staff_profile_id, endpoint)
);

create index if not exists push_subscriptions_department_active_idx
  on public.push_subscriptions(department_id, is_active);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  short_shift_alerts boolean not null default true,
  coverage_request_alerts boolean not null default true,
  switch_request_alerts boolean not null default true,
  coverage_offer_alerts boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id)
);

create index if not exists notification_preferences_department_idx
  on public.notification_preferences(department_id);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  event_type text not null,
  title text not null,
  body text not null,
  related_entity_type text,
  related_entity_id uuid,
  delivery_status public.notification_delivery_status not null default 'queued',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error_message text
);

create index if not exists notification_events_department_created_idx
  on public.notification_events(department_id, created_at desc);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;

create policy "Staff can read their push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (staff_profile_id = public.current_staff_profile_id(department_id));

create policy "Staff can create their push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (
    public.user_is_department_member(department_id)
    and staff_profile_id = public.current_staff_profile_id(department_id)
  );

create policy "Staff can update their push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (staff_profile_id = public.current_staff_profile_id(department_id))
  with check (staff_profile_id = public.current_staff_profile_id(department_id));

create policy "Department admins can manage push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Staff can read their notification preferences"
  on public.notification_preferences
  for select
  to authenticated
  using (staff_profile_id = public.current_staff_profile_id(department_id));

create policy "Staff can create their notification preferences"
  on public.notification_preferences
  for insert
  to authenticated
  with check (
    public.user_is_department_member(department_id)
    and staff_profile_id = public.current_staff_profile_id(department_id)
  );

create policy "Staff can update their notification preferences"
  on public.notification_preferences
  for update
  to authenticated
  using (staff_profile_id = public.current_staff_profile_id(department_id))
  with check (staff_profile_id = public.current_staff_profile_id(department_id));

create policy "Department admins can manage notification preferences"
  on public.notification_preferences
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));

create policy "Staff can read their notification events"
  on public.notification_events
  for select
  to authenticated
  using (
    staff_profile_id = public.current_staff_profile_id(department_id)
    or public.user_is_department_admin(department_id)
  );

create policy "Department admins can manage notification events"
  on public.notification_events
  for all
  to authenticated
  using (public.user_is_department_admin(department_id))
  with check (public.user_is_department_admin(department_id));
