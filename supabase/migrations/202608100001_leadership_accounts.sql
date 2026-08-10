-- Dedicated Leadership access is intentionally separate from the legacy
-- Director operations role so these accounts do not inherit ICU or operations
-- page access.
alter table public.staff_profiles
  drop constraint if exists staff_profiles_operations_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_operations_role_check
  check (
    operations_role in (
      'none',
      'aide',
      'command_center',
      'director',
      'leadership',
      'icu_command_center'
    )
  );

create or replace function public.user_is_department_leadership(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.staff_profiles staff
    where staff.department_id = target_department_id
      and staff.profile_id = public.current_profile_id()
      and staff.operations_role = 'leadership'
      and staff.is_active = true
  );
$$;

revoke all on function public.user_is_department_leadership(uuid)
  from public, anon;
grant execute on function public.user_is_department_leadership(uuid)
  to authenticated;

-- Ramon owns the existing, unclaimed `aloha` staff identity. Rename that same
-- row in place while keeping it unclaimed so the normal first-login flow can
-- create his Auth/profile identity and password later. Jimmy and the generic
-- Leadership identity are provisioned only when their usernames are unused.
do $$
declare
  target_department_id uuid;
  ramon public.staff_profiles%rowtype;
  ramon_target public.staff_profiles%rowtype;
  ramon_was_renamed boolean := false;
  ramon_is_unclaimed boolean := false;
  account record;
  existing public.staff_profiles%rowtype;
begin
  select staff.*
  into ramon
  from public.staff_profiles staff
  where staff.username_normalized = 'aloha';

  if not found then
    select staff.*
    into ramon
    from public.staff_profiles staff
    where staff.username_normalized = 'holr';

    if not found then
      raise exception 'leadership_ramon_source_account_missing'
        using errcode = 'P0001';
    end if;
  end if;

  if public.normalize_username(ramon.display_name) <> 'ramonhollander' then
    raise exception 'leadership_ramon_identity_mismatch:%', ramon.username_normalized
      using errcode = 'P0001';
  end if;

  if ramon.assigned_role <> 'staff' or not ramon.is_active then
    raise exception 'leadership_ramon_staff_identity_mismatch'
      using errcode = 'P0001';
  end if;

  target_department_id := ramon.department_id;
  ramon_is_unclaimed := ramon.account_claimed_at is null
    and ramon.auth_user_id is null
    and ramon.profile_id is null;

  if ramon.username_normalized = 'aloha' and not ramon_is_unclaimed then
    raise exception 'leadership_ramon_unclaimed_account_required'
      using errcode = 'P0001';
  end if;

  if ramon.username_normalized = 'holr'
     and not ramon_is_unclaimed then
    if ramon.account_claimed_at is null
       or ramon.auth_user_id is null
       or ramon.profile_id is null
       or not exists (
         select 1
         from auth.users auth_user
         where auth_user.id = ramon.auth_user_id
           and lower(auth_user.email) = 'holr@washington-schedule.local'
       )
       or not exists (
         select 1
         from public.profiles profile
         where profile.id = ramon.profile_id
           and profile.auth_user_id = ramon.auth_user_id
       )
       or not exists (
         select 1
         from public.department_memberships membership
         where membership.department_id = ramon.department_id
           and membership.profile_id = ramon.profile_id
       ) then
      raise exception 'leadership_ramon_existing_account_linkage_invalid'
        using errcode = 'P0001';
    end if;
  end if;

  select staff.*
  into ramon_target
  from public.staff_profiles staff
  where staff.username_normalized = 'holr';

  if found and ramon_target.id <> ramon.id then
    raise exception 'leadership_ramon_target_username_collision'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.staff_profiles staff
    where staff.id <> ramon.id
      and staff.department_id = ramon.department_id
      and public.normalize_username(staff.display_name) = 'ramonhollander'
  ) then
    raise exception 'leadership_ramon_duplicate_profile_collision'
      using errcode = '23505';
  end if;

  ramon_was_renamed := ramon.username_normalized = 'aloha';

  update public.staff_profiles staff
  set
    username = 'holr',
    username_normalized = 'holr',
    assigned_role = 'staff',
    operations_role = 'leadership',
    password_reset_required = ramon_is_unclaimed
  where staff.id = ramon.id
    and (
      staff.username is distinct from 'holr'
      or staff.username_normalized is distinct from 'holr'
      or staff.assigned_role is distinct from 'staff'
      or staff.operations_role is distinct from 'leadership'
      or staff.password_reset_required is distinct from ramon_is_unclaimed
    );

  if not exists (
    select 1
    from public.staff_profiles staff
    where staff.id = ramon.id
      and staff.username_normalized = 'holr'
      and staff.assigned_role = 'staff'
      and staff.operations_role = 'leadership'
      and staff.password_reset_required = ramon_is_unclaimed
      and (
        not ramon_is_unclaimed
        or (
          staff.account_claimed_at is null
          and staff.auth_user_id is null
          and staff.profile_id is null
        )
      )
  ) then
    raise exception 'leadership_ramon_identity_changed_during_migration'
      using errcode = '40001';
  end if;

  if ramon_was_renamed then
    insert into public.audit_events (
      department_id,
      actor_profile_id,
      event_type,
      entity_type,
      entity_id,
      before_json,
      after_json
    )
    values (
      ramon.department_id,
      null,
      'staff_username_renamed',
      'staff_profile',
      ramon.id,
      jsonb_build_object(
        'username', 'aloha',
        'account_state', 'unclaimed',
        'staff_profile_id', ramon.id
      ),
      jsonb_build_object(
        'username', 'holr',
        'account_state', 'unclaimed',
        'staff_profile_id', ramon.id,
        'operations_role', 'leadership'
      )
    );
  end if;

  for account in
    select *
    from (
      values
        ('chaj'::text, 'Jimmy Chang'::text),
        ('lead'::text, 'Lead/Leadership'::text)
    ) as accounts(username, display_name)
  loop
    existing := null;

    select staff.*
    into existing
    from public.staff_profiles staff
    where staff.username_normalized = account.username;

    if found then
      if existing.department_id <> target_department_id
         or public.normalize_username(existing.display_name)
           <> public.normalize_username(account.display_name) then
        raise exception 'leadership_username_collision:%', account.username
          using errcode = '23505';
      end if;

      if existing.operations_role = 'leadership'
         and existing.assigned_role = 'staff'
         and existing.is_active then
        if existing.account_claimed_at is null
           and existing.auth_user_id is null
           and existing.profile_id is null then
          update public.staff_profiles staff
          set password_reset_required = true
          where staff.id = existing.id
            and staff.password_reset_required is distinct from true;

          continue;
        end if;

        if (
          existing.account_claimed_at is not null
          and existing.auth_user_id is not null
          and existing.profile_id is not null
          and exists (
            select 1
            from auth.users auth_user
            where auth_user.id = existing.auth_user_id
              and lower(auth_user.email) = account.username || '@washington-schedule.local'
          )
          and exists (
            select 1
            from public.profiles profile
            where profile.id = existing.profile_id
              and profile.auth_user_id = existing.auth_user_id
          )
          and exists (
            select 1
            from public.department_memberships membership
            where membership.department_id = existing.department_id
              and membership.profile_id = existing.profile_id
          )
        ) then
          update public.staff_profiles staff
          set password_reset_required = false
          where staff.id = existing.id
            and staff.password_reset_required is distinct from false;

          continue;
        end if;

        raise exception 'leadership_existing_account_linkage_invalid:%', account.username
          using errcode = 'P0001';
      end if;

      if existing.account_claimed_at is not null
         or existing.auth_user_id is not null
         or existing.profile_id is not null then
        raise exception 'leadership_claimed_account_collision:%', account.username
          using errcode = '23505';
      end if;

      if existing.operations_role = 'leadership'
         or existing.assigned_role = 'staff' then
        raise exception 'leadership_existing_account_collision:%', account.username
          using errcode = '23505';
      else
        raise exception 'leadership_existing_privileged_account_collision:%', account.username
          using errcode = '23505';
      end if;
    end if;

    if exists (
      select 1
      from public.staff_profiles staff
      where staff.department_id = target_department_id
        and public.normalize_username(staff.display_name)
          = public.normalize_username(account.display_name)
    ) then
      raise exception 'leadership_display_name_collision:%', account.display_name
        using errcode = '23505';
    end if;

    insert into public.staff_profiles (
      department_id,
      display_name,
      username,
      username_normalized,
      assigned_role,
      operations_role,
      employment_type,
      home_assignment,
      password_reset_required,
      is_active
    )
    values (
      target_department_id,
      account.display_name,
      account.username,
      account.username,
      'staff',
      'leadership',
      'full_time',
      'day_shift',
      true,
      true
    );
  end loop;
end;
$$;

-- A disabled preference row is the durable onboarding marker. Leadership
-- accounts never receive a push subscription and never see notification setup.
create or replace function public.initialize_leadership_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.operations_role <> 'leadership'
     or new.account_claimed_at is null then
    return new;
  end if;

  insert into public.notification_preferences (
    department_id,
    staff_profile_id,
    short_shift_alerts,
    coverage_request_alerts,
    switch_request_alerts,
    coverage_offer_alerts,
    quiet_hours_enabled,
    quiet_hours_start,
    quiet_hours_end
  )
  values (
    new.department_id,
    new.id,
    false,
    false,
    false,
    false,
    false,
    null,
    null
  )
  on conflict (staff_profile_id) do update
  set
    department_id = excluded.department_id,
    short_shift_alerts = false,
    coverage_request_alerts = false,
    switch_request_alerts = false,
    coverage_offer_alerts = false,
    quiet_hours_enabled = false,
    quiet_hours_start = null,
    quiet_hours_end = null;

  update public.push_subscriptions subscription
  set
    is_active = false,
    revoked_at = coalesce(subscription.revoked_at, clock_timestamp())
  where subscription.staff_profile_id = new.id
    and subscription.is_active = true;

  return new;
end;
$$;

revoke all on function public.initialize_leadership_notification_preferences()
  from public, anon, authenticated;

drop trigger if exists staff_profiles_initialize_leadership_notifications
  on public.staff_profiles;
create trigger staff_profiles_initialize_leadership_notifications
  after insert or update of operations_role, account_claimed_at
  on public.staff_profiles
  for each row
  when (new.operations_role = 'leadership' and new.account_claimed_at is not null)
  execute function public.initialize_leadership_notification_preferences();

insert into public.notification_preferences (
  department_id,
  staff_profile_id,
  short_shift_alerts,
  coverage_request_alerts,
  switch_request_alerts,
  coverage_offer_alerts,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end
)
select
  staff.department_id,
  staff.id,
  false,
  false,
  false,
  false,
  false,
  null,
  null
from public.staff_profiles staff
where staff.operations_role = 'leadership'
  and staff.account_claimed_at is not null
on conflict (staff_profile_id) do update
set
  department_id = excluded.department_id,
  short_shift_alerts = false,
  coverage_request_alerts = false,
  switch_request_alerts = false,
  coverage_offer_alerts = false,
  quiet_hours_enabled = false,
  quiet_hours_start = null,
  quiet_hours_end = null;

update public.push_subscriptions subscription
set
  is_active = false,
  revoked_at = coalesce(subscription.revoked_at, clock_timestamp())
from public.staff_profiles staff
where staff.id = subscription.staff_profile_id
  and staff.operations_role = 'leadership'
  and subscription.is_active = true;

drop policy if exists "Staff can create their push subscriptions"
  on public.push_subscriptions;
create policy "Staff can create their push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (
    staff_profile_id = public.current_staff_profile_id(department_id)
    and not public.user_is_department_leadership(department_id)
  );

drop policy if exists "Staff can update their push subscriptions"
  on public.push_subscriptions;
create policy "Staff can update their push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (
    staff_profile_id = public.current_staff_profile_id(department_id)
    and not public.user_is_department_leadership(department_id)
  )
  with check (
    staff_profile_id = public.current_staff_profile_id(department_id)
    and not public.user_is_department_leadership(department_id)
  );

drop policy if exists "Staff can create their notification preferences"
  on public.notification_preferences;
create policy "Staff can create their notification preferences"
  on public.notification_preferences
  for insert
  to authenticated
  with check (
    staff_profile_id = public.current_staff_profile_id(department_id)
    and not public.user_is_department_leadership(department_id)
  );

drop policy if exists "Staff can update their notification preferences"
  on public.notification_preferences;
create policy "Staff can update their notification preferences"
  on public.notification_preferences
  for update
  to authenticated
  using (
    staff_profile_id = public.current_staff_profile_id(department_id)
    and not public.user_is_department_leadership(department_id)
  )
  with check (
    staff_profile_id = public.current_staff_profile_id(department_id)
    and not public.user_is_department_leadership(department_id)
  );

-- Leadership sees only the read-only snapshot data already rendered inside the
-- Leadership Dashboard. Application route guards continue to reject the ICU
-- and Rental Management pages themselves.
create or replace function public.user_can_view_icu_patients(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.user_can_manage_icu_patients(target_department_id)
    or public.user_is_department_director(target_department_id)
    or public.user_is_department_leadership(target_department_id)
    or public.user_is_command_center(target_department_id);
$$;

revoke all on function public.user_can_view_icu_patients(uuid)
  from public, anon;
grant execute on function public.user_can_view_icu_patients(uuid)
  to authenticated;

drop policy if exists "Leadership can read rental snapshot records"
  on public.rental_records;
create policy "Leadership can read rental snapshot records"
  on public.rental_records
  for select
  to authenticated
  using (public.user_is_department_leadership(department_id));

-- Leadership can read and create board notes, but root-note attribution must
-- match the authenticated staff record. Updates stay Lead/Admin-only; replies
-- use the narrow function below so arbitrary note fields cannot be changed.
drop policy if exists "Lead communication participants can read notes"
  on public.lead_communication_notes;
create policy "Lead communication participants can read notes"
  on public.lead_communication_notes
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
    or public.user_is_department_director(department_id)
    or public.user_is_department_leadership(department_id)
    or public.user_is_icu_command_center(department_id)
  );

drop policy if exists "Lead communication participants can create notes"
  on public.lead_communication_notes;
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
      or public.user_is_department_leadership(department_id)
      or public.user_is_icu_command_center(department_id)
    )
    and created_by_staff_profile_id = public.current_staff_profile_id(department_id)
    and status = 'new'
    and (
      not public.user_is_department_leadership(department_id)
      or exists (
        select 1
        from public.staff_profiles staff
        where staff.id = created_by_staff_profile_id
          and staff.department_id = lead_communication_notes.department_id
          and staff.profile_id = public.current_profile_id()
          and staff.display_name = created_by_name
          and staff.operations_role = 'leadership'
          and staff.is_active = true
      )
    )
  );

create or replace function public.reply_to_lead_communication_note(
  target_note_id uuid,
  reply_text text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_staff public.staff_profiles%rowtype;
  replied_at timestamptz := clock_timestamp();
begin
  reply_text := btrim(coalesce(reply_text, ''));

  if char_length(reply_text) < 1 or char_length(reply_text) > 500 then
    raise exception 'lead_communication_reply_invalid'
      using errcode = '22023';
  end if;

  select staff.*
  into actor_staff
  from public.staff_profiles staff
  where staff.profile_id = public.current_profile_id()
    and staff.operations_role = 'leadership'
    and staff.is_active = true;

  if not found then
    raise exception 'leadership_access_required'
      using errcode = '42501';
  end if;

  update public.lead_communication_notes note
  set
    status = 'reviewed',
    follow_up_text = reply_text,
    followed_up_at = replied_at,
    followed_up_by_staff_profile_id = actor_staff.id,
    followed_up_by_name = actor_staff.display_name,
    reviewed_at = coalesce(note.reviewed_at, replied_at),
    reviewed_by_staff_profile_id = coalesce(note.reviewed_by_staff_profile_id, actor_staff.id),
    reviewed_by_name = coalesce(note.reviewed_by_name, actor_staff.display_name)
  where note.id = target_note_id
    and note.department_id = actor_staff.department_id
    and note.status <> 'closed'
    and note.follow_up_text is null;

  if not found then
    raise exception 'lead_communication_reply_not_available'
      using errcode = 'P0001';
  end if;

  return true;
end;
$$;

revoke all on function public.reply_to_lead_communication_note(uuid, text)
  from public, anon;
grant execute on function public.reply_to_lead_communication_note(uuid, text)
  to authenticated;

-- Announcement management is an existing Leadership Dashboard dialog. Keep
-- it available without granting any operational or administrative page role.
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
    or public.user_is_department_leadership(new.department_id)
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

revoke all on function public.set_department_announcement_attribution()
  from public, anon, authenticated;

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
    or public.user_is_department_leadership(department_id)
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
    or public.user_is_department_leadership(department_id)
  )
  with check (
    public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
    or public.user_is_department_director(department_id)
    or public.user_is_department_leadership(department_id)
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
    or public.user_is_department_leadership(department_id)
  );
