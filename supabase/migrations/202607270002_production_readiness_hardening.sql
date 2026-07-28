-- Final production-readiness hardening.
-- This migration is additive and safe to apply after 202607270001.

-- Roles are assigned by an authenticated department administrator. Usernames
-- are identifiers only and must never confer privilege.
alter table public.staff_profiles
  drop constraint if exists staff_profiles_admin_username_check;

-- A username identifies exactly one pre-created staff record across the whole
-- application. Normalize legacy values, repair only unclaimed duplicates, and
-- fail rather than silently changing an already activated account.
update public.staff_profiles
set
  username = btrim(username),
  username_normalized = public.normalize_username(username)
where username is not null
  and (
    username is distinct from btrim(username)
    or username_normalized is distinct from public.normalize_username(username)
  );

with ranked_usernames as (
  select
    staff.id,
    staff.username_normalized,
    row_number() over (
      partition by staff.username_normalized
      order by
        (staff.account_claimed_at is not null or staff.auth_user_id is not null) desc,
        staff.is_active desc,
        staff.created_at,
        staff.id
    ) as duplicate_rank
  from public.staff_profiles staff
  where staff.username_normalized is not null
),
repairable_duplicates as (
  select
    staff.id,
    staff.username_normalized
      || replace(staff.id::text, '-', '') as replacement_username
  from public.staff_profiles staff
  join ranked_usernames ranked
    on ranked.id = staff.id
  where ranked.duplicate_rank > 1
    and staff.account_claimed_at is null
    and staff.auth_user_id is null
)
update public.staff_profiles staff
set
  username = duplicate.replacement_username,
  username_normalized = public.normalize_username(duplicate.replacement_username)
from repairable_duplicates duplicate
where staff.id = duplicate.id;

do $$
begin
  if exists (
    select 1
    from public.staff_profiles staff
    where staff.username_normalized is not null
    group by staff.username_normalized
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce global username uniqueness because multiple activated accounts share a normalized username';
  end if;

  if exists (
    select 1
    from public.staff_profiles staff
    where public.normalize_username(staff.username) = ''
  ) then
    raise exception 'Cannot enforce username normalization because a staff username is empty';
  end if;
end;
$$;

drop index if exists public.staff_profiles_department_username_normalized_unique;

create unique index if not exists staff_profiles_username_normalized_unique
  on public.staff_profiles(username_normalized);

alter table public.staff_profiles
  alter column username set not null,
  alter column username_normalized set not null;

create or replace function public.enforce_staff_username_normalization()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.username := btrim(new.username);
  new.username_normalized := public.normalize_username(new.username);

  if new.username_normalized = '' then
    raise exception 'Staff username is required'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists staff_profiles_normalize_username
  on public.staff_profiles;
create trigger staff_profiles_normalize_username
  before insert or update of username, username_normalized
  on public.staff_profiles
  for each row
  execute function public.enforce_staff_username_normalization();

revoke all on function public.enforce_staff_username_normalization()
  from public, anon, authenticated;

-- The service-side activation route creates the Supabase Auth identity first,
-- then calls this function. The row lock and conditional checks make linking,
-- profile creation, membership creation, and audit logging one transaction.
-- The Auth identity's deterministic normalized email is independently unique,
-- so concurrent requests cannot both reach this transaction with new users.
create or replace function public.claim_staff_profile(
  requested_username text,
  requested_auth_user_id uuid
)
returns table (
  staff_profile_id uuid,
  department_id uuid,
  username text,
  display_name text,
  assigned_role public.app_role,
  operations_role text,
  phone_number text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_username text := public.normalize_username(requested_username);
  staff_record public.staff_profiles%rowtype;
  created_profile_id uuid;
  auth_email text;
begin
  if normalized_username = '' or requested_auth_user_id is null then
    raise exception 'claim_not_available'
      using errcode = 'P0001';
  end if;

  select staff.*
  into staff_record
  from public.staff_profiles staff
  where staff.username_normalized = normalized_username
  for update;

  if not found then
    raise exception 'claim_not_available'
      using errcode = 'P0001';
  end if;

  if not staff_record.is_active then
    raise exception 'claim_not_available'
      using errcode = 'P0001';
  end if;

  if staff_record.account_claimed_at is not null
     or staff_record.auth_user_id is not null
     or staff_record.profile_id is not null then
    raise exception 'claim_already_completed'
      using errcode = 'P0001';
  end if;

  select auth_user.email
  into auth_email
  from auth.users auth_user
  where auth_user.id = requested_auth_user_id;

  if not found
     or lower(coalesce(auth_email, ''))
       <> (normalized_username || '@washington-schedule.local') then
    raise exception 'claim_identity_mismatch'
      using errcode = 'P0001';
  end if;

  insert into public.profiles (
    auth_user_id,
    display_name,
    email
  )
  values (
    requested_auth_user_id,
    staff_record.display_name,
    auth_email
  )
  returning id into created_profile_id;

  insert into public.department_memberships (
    department_id,
    profile_id,
    role
  )
  values (
    staff_record.department_id,
    created_profile_id,
    staff_record.assigned_role
  );

  update public.staff_profiles staff
  set
    profile_id = created_profile_id,
    auth_user_id = requested_auth_user_id,
    account_claimed_at = clock_timestamp(),
    password_reset_required = false
  where staff.id = staff_record.id
    and staff.account_claimed_at is null
    and staff.auth_user_id is null
    and staff.profile_id is null;

  if not found then
    raise exception 'claim_already_completed'
      using errcode = 'P0001';
  end if;

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
    staff_record.department_id,
    created_profile_id,
    'staff_account_claimed',
    'staff_profile',
    staff_record.id,
    jsonb_build_object('account_claimed', false),
    jsonb_build_object(
      'account_claimed', true,
      'assigned_role', staff_record.assigned_role,
      'operations_role', staff_record.operations_role
    )
  );

  return query
  select
    staff_record.id,
    staff_record.department_id,
    staff_record.username,
    staff_record.display_name,
    staff_record.assigned_role,
    staff_record.operations_role,
    staff_record.phone_number;
end;
$$;

revoke all on function public.claim_staff_profile(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_staff_profile(text, uuid)
  to service_role;

create or replace function public.reset_staff_account_link(
  target_staff_profile_id uuid,
  requested_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_record public.staff_profiles%rowtype;
begin
  select staff.*
  into target_record
  from public.staff_profiles staff
  where staff.id = target_staff_profile_id
  for update;

  if not found then
    raise exception 'reset_target_not_found'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.department_memberships membership
    join public.staff_profiles actor_staff
      on actor_staff.department_id = membership.department_id
     and actor_staff.profile_id = membership.profile_id
     and actor_staff.is_active = true
    where membership.department_id = target_record.department_id
      and membership.profile_id = requested_actor_profile_id
      and membership.role = 'admin'::public.app_role
  ) then
    raise exception 'reset_not_authorized'
      using errcode = '42501';
  end if;

  if target_record.profile_id = requested_actor_profile_id then
    raise exception 'reset_self_not_allowed'
      using errcode = '42501';
  end if;

  update public.staff_profiles staff
  set
    profile_id = null,
    auth_user_id = null,
    account_claimed_at = null,
    password_reset_required = true
  where staff.id = target_record.id;

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
    target_record.department_id,
    requested_actor_profile_id,
    'staff_account_reset',
    'staff_profile',
    target_record.id,
    jsonb_build_object(
      'account_claimed',
      target_record.account_claimed_at is not null
        or target_record.auth_user_id is not null
        or target_record.profile_id is not null,
      'assigned_role', target_record.assigned_role,
      'operations_role', target_record.operations_role,
      'is_active', target_record.is_active
    ),
    jsonb_build_object(
      'account_claimed', false,
      'assigned_role', target_record.assigned_role,
      'operations_role', target_record.operations_role,
      'is_active', target_record.is_active
    )
  );

  return true;
end;
$$;

revoke all on function public.reset_staff_account_link(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reset_staff_account_link(uuid, uuid)
  to service_role;

-- Staffing needs support half-shift and other fractional coverage values; the
-- UI has always accepted decimals, so the database must not reject them.
alter table public.shift_status_updates
  alter column rts_required type numeric(6, 2)
  using rts_required::numeric(6, 2);

create index if not exists shift_status_updates_shift_latest_deterministic_idx
  on public.shift_status_updates(
    department_id,
    shift_date,
    shift_type,
    created_at desc,
    id desc
  );

alter table public.icu_patients
  drop constraint if exists icu_patients_fio2_range;

alter table public.icu_patients
  add constraint icu_patients_fio2_range
  check (fio2 is null or (fio2 >= 0 and fio2 <= 100));

-- Every RLS helper below requires a linked, active staff profile. This makes a
-- roster deactivation effective immediately even while an old auth token is
-- still present in a browser.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select profile.id
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.user_is_department_member(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.department_memberships membership
    join public.staff_profiles staff
      on staff.department_id = membership.department_id
     and staff.profile_id = membership.profile_id
     and staff.is_active = true
    where membership.department_id = target_department_id
      and membership.profile_id = public.current_profile_id()
  );
$$;

create or replace function public.user_is_department_admin(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.department_memberships membership
    join public.staff_profiles staff
      on staff.department_id = membership.department_id
     and staff.profile_id = membership.profile_id
     and staff.is_active = true
    where membership.department_id = target_department_id
      and membership.profile_id = public.current_profile_id()
      and membership.role = 'admin'
  );
$$;

create or replace function public.current_staff_profile_id(target_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select staff.id
  from public.staff_profiles staff
  where staff.department_id = target_department_id
    and staff.profile_id = public.current_profile_id()
    and staff.is_active = true
  limit 1;
$$;

create or replace function public.user_is_department_lead(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.department_memberships membership
    join public.staff_profiles staff
      on staff.department_id = membership.department_id
     and staff.profile_id = membership.profile_id
     and staff.is_active = true
    where membership.department_id = target_department_id
      and membership.profile_id = public.current_profile_id()
      and membership.role in ('lead', 'admin')
  );
$$;

create or replace function public.user_is_department_lead_or_admin(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.user_is_department_lead(target_department_id);
$$;

create or replace function public.user_is_department_aide(target_department_id uuid)
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
      and staff.operations_role = 'aide'
      and staff.is_active = true
  );
$$;

create or replace function public.user_is_command_center(target_department_id uuid)
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
      and staff.operations_role = 'command_center'
      and staff.is_active = true
  );
$$;

create or replace function public.user_is_department_director(target_department_id uuid)
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
      and staff.operations_role = 'director'
      and staff.is_active = true
  );
$$;

create or replace function public.user_is_icu_command_center(target_department_id uuid)
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
      and staff.operations_role = 'icu_command_center'
      and staff.is_active = true
  );
$$;

create or replace function public.user_can_manage_rentals(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.user_is_department_lead_or_admin(target_department_id)
    or public.user_is_department_aide(target_department_id)
    or public.user_is_command_center(target_department_id);
$$;

create or replace function public.user_can_manage_icu_patients(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.user_is_department_admin(target_department_id)
    or public.user_is_icu_command_center(target_department_id);
$$;

create or replace function public.user_can_view_icu_patients(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.user_can_manage_icu_patients(target_department_id)
    or public.user_is_department_director(target_department_id)
    or public.user_is_command_center(target_department_id);
$$;

create or replace function public.user_has_order_management_access()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.department_memberships membership
    join public.staff_profiles staff
      on staff.department_id = membership.department_id
     and staff.profile_id = membership.profile_id
     and staff.is_active = true
    where membership.profile_id = public.current_profile_id()
      and (
        membership.role = 'admin'
        or staff.operations_role = 'aide'
      )
  );
$$;

do $$
declare
  function_signature regprocedure;
begin
  foreach function_signature in array array[
    'public.current_profile_id()'::regprocedure,
    'public.user_is_department_member(uuid)'::regprocedure,
    'public.user_is_department_admin(uuid)'::regprocedure,
    'public.current_staff_profile_id(uuid)'::regprocedure,
    'public.user_is_department_lead(uuid)'::regprocedure,
    'public.user_is_department_lead_or_admin(uuid)'::regprocedure,
    'public.user_is_department_aide(uuid)'::regprocedure,
    'public.user_is_command_center(uuid)'::regprocedure,
    'public.user_is_department_director(uuid)'::regprocedure,
    'public.user_is_icu_command_center(uuid)'::regprocedure,
    'public.user_can_manage_rentals(uuid)'::regprocedure,
    'public.user_can_manage_icu_patients(uuid)'::regprocedure,
    'public.user_can_view_icu_patients(uuid)'::regprocedure,
    'public.user_has_order_management_access()'::regprocedure
  ]
  loop
    execute format('revoke all on function %s from public', function_signature);
    execute format('revoke all on function %s from anon', function_signature);
    execute format('grant execute on function %s to authenticated', function_signature);
  end loop;
end;
$$;

-- Attribution is derived from the authenticated account. The shared Command
-- Center may select an active Lead/Admin from the same department or provide
-- a human name when no staff profile is available; other callers cannot spoof
-- another employee through a crafted insert.
create or replace function public.enforce_shift_status_attribution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_staff_profile_id uuid;
  attributed_name text;
begin
  if auth.uid() is null then
    return new;
  end if;

  actor_staff_profile_id :=
    public.current_staff_profile_id(new.department_id);

  if actor_staff_profile_id is null then
    raise exception 'Shift status attribution is not permitted'
      using errcode = '42501';
  end if;

  if public.user_is_command_center(new.department_id) then
    if new.updated_by_staff_profile_id is not null then
      select staff.display_name
      into attributed_name
      from public.staff_profiles staff
      where staff.id = new.updated_by_staff_profile_id
        and staff.department_id = new.department_id
        and staff.is_active = true
        and staff.assigned_role in (
          'lead'::public.app_role,
          'admin'::public.app_role
        )
        and staff.operations_role = 'none';

      if not found then
        raise exception 'Shift status attribution is not permitted'
          using errcode = '42501';
      end if;

      new.updated_by_name := attributed_name;
    else
      new.updated_by_name := btrim(coalesce(new.updated_by_name, ''));

      if new.updated_by_name = ''
         or lower(new.updated_by_name) = 'sputum'
         or lower(new.updated_by_name) like '%command center%' then
        raise exception 'Shift status attribution is required'
          using errcode = '23514';
      end if;
    end if;
  elsif public.user_is_department_lead(new.department_id) then
    new.updated_by_staff_profile_id := actor_staff_profile_id;

    select staff.display_name
    into attributed_name
    from public.staff_profiles staff
    where staff.id = actor_staff_profile_id;
    new.updated_by_name := attributed_name;
  else
    raise exception 'Shift status attribution is not permitted'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists shift_status_updates_enforce_attribution
  on public.shift_status_updates;
create trigger shift_status_updates_enforce_attribution
  before insert on public.shift_status_updates
  for each row
  execute function public.enforce_shift_status_attribution();

revoke all on function public.enforce_shift_status_attribution()
  from public, anon, authenticated;

-- Compare a Lead save with the previous Lead-specific canonical event, not
-- with a generic shift-status row whose timestamp and ordering can be changed
-- or tied by unrelated data. This keeps unrelated saves from republishing a
-- stale value while still allowing Lead 7 -> ICU 4 -> Lead 7 to publish the
-- final genuine Lead change.
create or replace function public.publish_lead_official_vent_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  previous_vent_count integer;
  previous_update_found boolean := false;
begin
  select update_row.vent_count, true
  into previous_vent_count, previous_update_found
  from public.official_vent_count_updates update_row
  where update_row.department_id = new.department_id
    and update_row.shift_date = new.shift_date
    and update_row.shift_type = new.shift_type
    and update_row.source = 'lead_command_center'
  order by update_row.created_at desc, update_row.id desc
  limit 1;

  if not previous_update_found
     or previous_vent_count is distinct from new.vent_count then
    insert into public.official_vent_count_updates (
      department_id,
      shift_date,
      shift_type,
      vent_count,
      source,
      updated_by_staff_profile_id,
      updated_by_name
    )
    values (
      new.department_id,
      new.shift_date,
      new.shift_type,
      new.vent_count,
      'lead_command_center',
      new.updated_by_staff_profile_id,
      new.updated_by_name
    );
  end if;

  return new;
end;
$$;

revoke all on function public.publish_lead_official_vent_count()
  from public, anon, authenticated;

-- Keep the staff profile and effective membership role synchronized, record
-- every access change, and make the final-administrator rule concurrency safe.
create or replace function public.protect_active_administrator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  removes_active_admin boolean;
  other_active_admin_exists boolean;
begin
  removes_active_admin :=
    old.assigned_role = 'admin'::public.app_role
    and old.is_active = true
    and old.account_claimed_at is not null
    and old.auth_user_id is not null
    and old.profile_id is not null
    and (
      tg_op = 'DELETE'
      or new.assigned_role <> 'admin'::public.app_role
      or new.is_active = false
    );

  if not removes_active_admin then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(old.department_id::text, 94721)
  );

  if auth.uid() is not null and old.auth_user_id = auth.uid() then
    raise exception 'An administrator cannot remove their own administrator access'
      using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.staff_profiles staff
    where staff.department_id = old.department_id
      and staff.id <> old.id
      and staff.assigned_role = 'admin'::public.app_role
      and staff.is_active = true
      and staff.account_claimed_at is not null
      and staff.auth_user_id is not null
      and staff.profile_id is not null
  )
  into other_active_admin_exists;

  if not other_active_admin_exists then
    raise exception 'At least one active administrator is required'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.sync_and_audit_staff_access()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
begin
  if new.profile_id is not null
     and new.display_name is distinct from old.display_name then
    update public.profiles profile
    set display_name = new.display_name
    where profile.id = new.profile_id;

    if not found then
      raise exception 'Linked account profile could not be updated'
        using errcode = '23503';
    end if;
  end if;

  if new.profile_id is not null
     and new.assigned_role is distinct from old.assigned_role then
    update public.department_memberships membership
    set role = new.assigned_role
    where membership.department_id = new.department_id
      and membership.profile_id = new.profile_id;

    if not found then
      raise exception 'Linked department membership could not be updated'
        using errcode = '23503';
    end if;
  end if;

  if new.assigned_role is distinct from old.assigned_role
     or new.operations_role is distinct from old.operations_role
     or new.is_active is distinct from old.is_active then
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
      new.department_id,
      actor_profile_id,
      'staff_access_changed',
      'staff_profile',
      new.id,
      jsonb_build_object(
        'assigned_role', old.assigned_role,
        'operations_role', old.operations_role,
        'is_active', old.is_active
      ),
      jsonb_build_object(
        'assigned_role', new.assigned_role,
        'operations_role', new.operations_role,
        'is_active', new.is_active
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.audit_staff_access_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
begin
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
    case when tg_op = 'DELETE' then old.department_id else new.department_id end,
    actor_profile_id,
    case
      when tg_op = 'DELETE' then 'staff_access_deleted'
      else 'staff_access_created'
    end,
    'staff_profile',
    case when tg_op = 'DELETE' then old.id else new.id end,
    case
      when tg_op = 'DELETE' then jsonb_build_object(
        'assigned_role', old.assigned_role,
        'operations_role', old.operations_role,
        'is_active', old.is_active
      )
      else null
    end,
    case
      when tg_op = 'INSERT' then jsonb_build_object(
        'assigned_role', new.assigned_role,
        'operations_role', new.operations_role,
        'is_active', new.is_active
      )
      else null
    end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists staff_profiles_protect_active_administrator
  on public.staff_profiles;
create trigger staff_profiles_protect_active_administrator
  before update of assigned_role, is_active or delete
  on public.staff_profiles
  for each row
  execute function public.protect_active_administrator();

drop trigger if exists staff_profiles_sync_and_audit_access
  on public.staff_profiles;
create trigger staff_profiles_sync_and_audit_access
  after update of display_name, assigned_role, operations_role, is_active
  on public.staff_profiles
  for each row
  execute function public.sync_and_audit_staff_access();

drop trigger if exists staff_profiles_audit_access_lifecycle
  on public.staff_profiles;
create trigger staff_profiles_audit_access_lifecycle
  after insert or delete
  on public.staff_profiles
  for each row
  execute function public.audit_staff_access_lifecycle();

revoke all on function public.protect_active_administrator()
  from public, anon, authenticated;
revoke all on function public.sync_and_audit_staff_access()
  from public, anon, authenticated;
revoke all on function public.audit_staff_access_lifecycle()
  from public, anon, authenticated;

-- The first canonical-vent migration assigned post-midnight ICU updates to
-- the wall-calendar date. Correct those append-only rows before replacing the
-- writer so they cannot surface as stale data on the following night shift.
update public.official_vent_count_updates update_row
set shift_date = update_row.shift_date - 1
where update_row.source = 'icu_command_center'
  and (update_row.created_at at time zone 'America/Los_Angeles')::time < time '08:00'
  and update_row.shift_type = 'night'::public.shift_status_shift_type
  and update_row.shift_date =
    (update_row.created_at at time zone 'America/Los_Angeles')::date;

-- Post-midnight ICU changes belong to the night shift that began on the
-- previous operational date.
create or replace function public.insert_icu_official_vent_count(
  target_department_id uuid,
  actor_staff_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  local_now timestamp without time zone := clock_timestamp() at time zone 'America/Los_Angeles';
  operational_shift_date date :=
    case
      when local_now::time < time '08:00' then local_now::date - 1
      else local_now::date
    end;
  operational_shift_type public.shift_status_shift_type :=
    case
      when local_now::time >= time '08:00' and local_now::time < time '20:00'
        then 'day'::public.shift_status_shift_type
      else 'night'::public.shift_status_shift_type
    end;
  tracked_vent_count integer;
  actor_name text;
begin
  select count(*)::integer
    into tracked_vent_count
  from public.icu_patients patient
  where patient.department_id = target_department_id
    and patient.is_active = true
    and patient.device_type = 'vent';

  select staff.display_name
    into actor_name
  from public.staff_profiles staff
  where staff.id = actor_staff_profile_id;

  insert into public.official_vent_count_updates (
    department_id,
    shift_date,
    shift_type,
    vent_count,
    source,
    updated_by_staff_profile_id,
    updated_by_name
  )
  values (
    target_department_id,
    operational_shift_date,
    operational_shift_type,
    tracked_vent_count,
    'icu_command_center',
    actor_staff_profile_id,
    actor_name
  );
end;
$$;

revoke all on function public.insert_icu_official_vent_count(uuid, uuid) from public;
revoke all on function public.insert_icu_official_vent_count(uuid, uuid) from anon;
revoke all on function public.insert_icu_official_vent_count(uuid, uuid) from authenticated;

-- Offer response and request resolution are one transaction. A client can no
-- longer leave an accepted offer attached to an active request.
create or replace function public.respond_to_shift_request_offer(
  target_offer_id uuid,
  response_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  offer_row public.shift_request_offers%rowtype;
  request_row public.shift_requests%rowtype;
  actor_staff_profile_id uuid;
  response_value public.coverage_offer_status;
begin
  if auth.uid() is null or response_status not in ('accepted', 'declined') then
    raise exception 'Offer response is not permitted' using errcode = '42501';
  end if;

  response_value := response_status::public.coverage_offer_status;

  select offer.*
    into offer_row
  from public.shift_request_offers offer
  where offer.id = target_offer_id
  for update;

  if not found then
    raise exception 'Offer not found' using errcode = 'P0002';
  end if;

  actor_staff_profile_id := public.current_staff_profile_id(offer_row.department_id);

  select request.*
    into request_row
  from public.shift_requests request
  where request.id = offer_row.shift_request_id
  for update;

  if actor_staff_profile_id is null
     or request_row.staff_profile_id is distinct from actor_staff_profile_id
     or offer_row.status <> 'offered'
     or request_row.status <> 'active' then
    raise exception 'Offer response is not permitted' using errcode = '42501';
  end if;

  update public.shift_request_offers
  set
    status = response_value,
    responded_at = clock_timestamp()
  where id = offer_row.id;

  if response_value = 'accepted' then
    update public.shift_requests
    set
      status = 'resolved',
      resolved_at = clock_timestamp(),
      cancelled_at = null
    where id = request_row.id;

    update public.shift_request_offers
    set status = 'cancelled'
    where shift_request_id = request_row.id
      and id <> offer_row.id
      and status = 'offered';
  end if;

  return offer_row.id;
end;
$$;

revoke all on function public.respond_to_shift_request_offer(uuid, text) from public;
revoke all on function public.respond_to_shift_request_offer(uuid, text) from anon;
grant execute on function public.respond_to_shift_request_offer(uuid, text) to authenticated;

-- Self-managed add/move operations are also transactional and validate the
-- actor from auth rather than accepting a staff id from the client.
create or replace function public.save_self_managed_shift(
  target_department_id uuid,
  change_mode text,
  source_schedule_entry_id uuid,
  target_shift_date date,
  target_shift_type text,
  target_shift_start time,
  target_shift_end time,
  target_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_staff_profile_id uuid;
  source_entry public.schedule_entries%rowtype;
  added_override_id uuid;
  target_override_type public.user_schedule_override_type;
begin
  actor_staff_profile_id := public.current_staff_profile_id(target_department_id);

  if actor_staff_profile_id is null
     or change_mode not in ('add', 'available', 'move')
     or target_shift_date is null
     or target_shift_type is null
     or target_shift_start is null
     or target_shift_end is null
     or char_length(coalesce(target_note, '')) > 140 then
    raise exception 'Schedule change is not permitted' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      actor_staff_profile_id::text || ':' || target_shift_date::text || ':' ||
      target_shift_type || ':' || target_shift_start::text || ':' || target_shift_end::text,
      0
    )
  );

  if change_mode = 'move' then
    select entry.*
      into source_entry
    from public.schedule_entries entry
    join public.departments department
      on department.id = entry.department_id
     and department.active_schedule_version_id = entry.schedule_version_id
    where entry.id = source_schedule_entry_id
      and entry.department_id = target_department_id
      and entry.staff_profile_id = actor_staff_profile_id
    for update of entry;

    if not found then
      raise exception 'Source shift is not available' using errcode = '42501';
    end if;

    insert into public.user_schedule_overrides (
      department_id,
      staff_profile_id,
      base_schedule_entry_id,
      override_type,
      shift_date,
      shift_type,
      shift_start,
      shift_end,
      is_active
    )
    values (
      target_department_id,
      actor_staff_profile_id,
      source_entry.id,
      'remove_self',
      source_entry.shift_date,
      source_entry.shift_type,
      source_entry.shift_start,
      source_entry.shift_end,
      true
    );
  end if;

  target_override_type :=
    case
      when change_mode = 'available' then 'add_available'::public.user_schedule_override_type
      else 'add_self'::public.user_schedule_override_type
    end;

  insert into public.user_schedule_overrides (
    department_id,
    staff_profile_id,
    base_schedule_entry_id,
    override_type,
    shift_date,
    shift_type,
    shift_start,
    shift_end,
    note,
    is_active
  )
  values (
    target_department_id,
    actor_staff_profile_id,
    null,
    target_override_type,
    target_shift_date,
    target_shift_type,
    target_shift_start,
    target_shift_end,
    nullif(btrim(target_note), ''),
    true
  )
  returning id into added_override_id;

  return added_override_id;
end;
$$;

revoke all on function public.save_self_managed_shift(uuid, text, uuid, date, text, time, time, text) from public;
revoke all on function public.save_self_managed_shift(uuid, text, uuid, date, text, time, time, text) from anon;
grant execute on function public.save_self_managed_shift(uuid, text, uuid, date, text, time, time, text) to authenticated;

-- Harden older privileged functions without rewriting their established
-- lifecycle logic.
alter function public.create_pending_rental_delivery(
  uuid, uuid, public.rental_equipment_type, integer, timestamptz, uuid, text
) set search_path = pg_catalog, public;
alter function public.confirm_rental_delivery(
  uuid, uuid, timestamptz, text, text, text, text, public.rental_event_type
) set search_path = pg_catalog, public;
alter function public.call_rental_pickup(
  uuid, uuid, timestamptz, text, text
) set search_path = pg_catalog, public;
alter function public.confirm_rental_picked_up(
  uuid, uuid, timestamptz, text
) set search_path = pg_catalog, public;
alter function public.cancel_rental_delivery(
  uuid, uuid, timestamptz, text
) set search_path = pg_catalog, public;
alter function public.cancel_rental_pickup(
  uuid, uuid, timestamptz, text
) set search_path = pg_catalog, public;
alter function public.get_current_icu_snapshot_counts(uuid)
  set search_path = pg_catalog, public;
alter function public.enforce_coworker_custom_title_limit()
  set search_path = pg_catalog, public;

revoke all on function public.create_pending_rental_delivery(
  uuid, uuid, public.rental_equipment_type, integer, timestamptz, uuid, text
) from public, anon;
revoke all on function public.confirm_rental_delivery(
  uuid, uuid, timestamptz, text, text, text, text, public.rental_event_type
) from public, anon;
revoke all on function public.call_rental_pickup(
  uuid, uuid, timestamptz, text, text
) from public, anon;
revoke all on function public.confirm_rental_picked_up(
  uuid, uuid, timestamptz, text
) from public, anon;
revoke all on function public.cancel_rental_delivery(
  uuid, uuid, timestamptz, text
) from public, anon;
revoke all on function public.cancel_rental_pickup(
  uuid, uuid, timestamptz, text
) from public, anon;
revoke all on function public.get_current_icu_snapshot_counts(uuid)
  from public, anon;

grant execute on function public.create_pending_rental_delivery(
  uuid, uuid, public.rental_equipment_type, integer, timestamptz, uuid, text
) to authenticated;
grant execute on function public.confirm_rental_delivery(
  uuid, uuid, timestamptz, text, text, text, text, public.rental_event_type
) to authenticated;
grant execute on function public.call_rental_pickup(
  uuid, uuid, timestamptz, text, text
) to authenticated;
grant execute on function public.confirm_rental_picked_up(
  uuid, uuid, timestamptz, text
) to authenticated;
grant execute on function public.cancel_rental_delivery(
  uuid, uuid, timestamptz, text
) to authenticated;
grant execute on function public.cancel_rental_pickup(
  uuid, uuid, timestamptz, text
) to authenticated;
grant execute on function public.get_current_icu_snapshot_counts(uuid)
  to authenticated;

-- Privileged rental RPCs accept an attribution id for shared Command Center
-- use. For every other caller the attribution must be the caller's own staff
-- profile; the event trigger makes that invariant transactional.
create or replace function public.enforce_rental_event_actor()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null
     and not public.user_is_command_center(new.department_id)
     and new.actor_staff_profile_id is distinct from public.current_staff_profile_id(new.department_id) then
    raise exception 'INVALID_RENTAL_ACTOR' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists rental_events_enforce_actor on public.rental_events;
create trigger rental_events_enforce_actor
  before insert or update of actor_staff_profile_id, department_id
  on public.rental_events
  for each row execute function public.enforce_rental_event_actor();

revoke all on function public.enforce_rental_event_actor() from public, anon, authenticated;

-- Resolve invalid historical duplicates before adding database enforcement.
with ranked_shortages as (
  select
    shortage.id,
    row_number() over (
      partition by
        shortage.schedule_version_id,
        shortage.shift_date,
        shortage.shift_type,
        shortage.shift_start,
        shortage.shift_end
      order by shortage.created_at desc, shortage.id desc
    ) as duplicate_rank
  from public.shift_shortages shortage
  where shortage.status = 'active'
)
update public.shift_shortages shortage
set status = 'cancelled'
from ranked_shortages ranked
where shortage.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists shift_shortages_one_active_shift
  on public.shift_shortages(
    schedule_version_id,
    shift_date,
    shift_type,
    shift_start,
    shift_end
  )
  where status = 'active';

with ranked_additions as (
  select
    override_row.id,
    row_number() over (
      partition by
        override_row.department_id,
        override_row.staff_profile_id,
        override_row.shift_date,
        override_row.shift_type,
        override_row.shift_start,
        override_row.shift_end
      order by override_row.created_at desc, override_row.id desc
    ) as duplicate_rank
  from public.user_schedule_overrides override_row
  where override_row.is_active = true
    and override_row.override_type = 'add_self'
)
update public.user_schedule_overrides override_row
set is_active = false
from ranked_additions ranked
where override_row.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists user_schedule_overrides_one_active_addition
  on public.user_schedule_overrides(
    department_id,
    staff_profile_id,
    shift_date,
    shift_type,
    shift_start,
    shift_end
  )
  where is_active = true
    and override_type = 'add_self'::public.user_schedule_override_type;

-- Retried API calls and double taps must not create or send the same
-- entity-specific notification more than once to the same recipient.
with ranked_notifications as (
  select
    notification.id,
    row_number() over (
      partition by
        notification.recipient_staff_profile_id,
        notification.event_type,
        notification.related_entity_type,
        notification.related_entity_id
      order by notification.created_at, notification.id
    ) as duplicate_rank
  from public.notification_events notification
  where notification.recipient_staff_profile_id is not null
    and notification.related_entity_type is not null
    and notification.related_entity_id is not null
)
delete from public.notification_events notification
using ranked_notifications ranked
where notification.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists notification_events_entity_delivery_unique
  on public.notification_events(
    recipient_staff_profile_id,
    event_type,
    related_entity_type,
    related_entity_id
  )
  where recipient_staff_profile_id is not null
    and related_entity_type is not null
    and related_entity_id is not null;

-- Browser clients never need to insert arbitrary notification rows.
drop policy if exists "Department members can create notification events"
  on public.notification_events;
revoke insert on public.notification_events from authenticated;

-- Private storage remains department-scoped for reads. Only the uploader (or
-- a department administrator) may replace or remove an object.
drop policy if exists "Department members can update gossip images"
  on storage.objects;
create policy "Owners and admins can update gossip images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'gossip-images'
    and public.user_is_department_member(
      public.gossip_storage_department_id(name)
    )
    and (
      owner = auth.uid()
      or owner_id = auth.uid()::text
      or public.user_is_department_admin(
        public.gossip_storage_department_id(name)
      )
    )
  )
  with check (
    bucket_id = 'gossip-images'
    and public.user_is_department_member(
      public.gossip_storage_department_id(name)
    )
    and (
      owner = auth.uid()
      or owner_id = auth.uid()::text
      or public.user_is_department_admin(
        public.gossip_storage_department_id(name)
      )
    )
  );

drop policy if exists "Department members can delete gossip images"
  on storage.objects;
create policy "Owners and admins can delete gossip images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'gossip-images'
    and public.user_is_department_member(
      public.gossip_storage_department_id(name)
    )
    and (
      owner = auth.uid()
      or owner_id = auth.uid()::text
      or public.user_is_department_admin(
        public.gossip_storage_department_id(name)
      )
    )
  );

drop policy if exists "Owners and admins can delete department order images"
  on storage.objects;
create policy "Owners and admins can delete department order images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'department-order-images'
    and (
      (
        public.user_is_department_aide(
          public.department_order_storage_department_id(name)
        )
        and (owner = auth.uid() or owner_id = auth.uid()::text)
      )
      or public.user_is_department_admin(
        public.department_order_storage_department_id(name)
      )
    )
  );

-- Supabase's local and hosted migration runners do not necessarily use the
-- same default table privileges. Make browser access deterministic by granting
-- only the commands for which an authenticated RLS policy exists. RLS remains
-- the row-level authorization boundary, and anonymous clients receive no
-- direct public-table access.
do $$
declare
  policy_table record;
  table_privileges text;
begin
  revoke all privileges on all tables in schema public from anon;
  revoke truncate, references, trigger on all tables in schema public
    from authenticated;
  grant select, insert, update, delete
    on all tables in schema public
    to service_role;
  grant usage, select, update
    on all sequences in schema public
    to service_role;

  for policy_table in
    select
      policy.schemaname,
      policy.tablename,
      bool_or(policy.cmd in ('ALL', 'SELECT')) as can_select,
      bool_or(policy.cmd in ('ALL', 'INSERT')) as can_insert,
      bool_or(policy.cmd in ('ALL', 'UPDATE')) as can_update,
      bool_or(policy.cmd in ('ALL', 'DELETE')) as can_delete
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
    group by policy.schemaname, policy.tablename
  loop
    table_privileges := concat_ws(
      ', ',
      case when policy_table.can_select then 'select' end,
      case when policy_table.can_insert then 'insert' end,
      case when policy_table.can_update then 'update' end,
      case when policy_table.can_delete then 'delete' end
    );

    if table_privileges <> '' then
      execute format(
        'grant %s on table %I.%I to authenticated',
        table_privileges,
        policy_table.schemaname,
        policy_table.tablename
      );
    end if;
  end loop;
end;
$$;

-- Membership roles are synchronized from staff_profiles by a trigger. Prevent
-- a browser from bypassing that canonical role field with a direct write.
revoke insert, update, delete
  on public.department_memberships
  from authenticated;

-- Account profiles are created by the claim transaction and synchronized from
-- the canonical staff record. Browser writes are unnecessary and could alter
-- authentication linkage or visible identity outside the audited admin path.
revoke insert, update, delete on public.profiles from authenticated;

-- Even department administrators must use the atomic claim/reset functions
-- for account linkage. Limit browser UPDATE privileges to roster fields so a
-- crafted request cannot clear auth linkage and bypass self/last-admin rules.
revoke update on public.staff_profiles from authenticated;
grant update (
  display_name,
  username,
  username_normalized,
  assigned_role,
  operations_role,
  employment_type,
  home_assignment,
  phone_number,
  email,
  preferred_contact_method,
  is_active,
  status_message,
  status_updated_at
) on public.staff_profiles to authenticated;

-- Realtime publication is required for cross-tab and cross-role operational
-- consistency. RLS still controls which rows each subscriber can receive.
do $$
declare
  table_name text;
begin
  if exists (
    select 1
    from pg_catalog.pg_publication publication
    where publication.pubname = 'supabase_realtime'
      and publication.puballtables = false
  ) then
    foreach table_name in array array[
      'departments',
      'shift_status_updates',
      'icu_patients',
      'icu_patient_events',
      'schedule_versions',
      'schedule_entries',
      'shift_shortages',
      'user_schedule_overrides',
      'shift_requests',
      'shift_request_offers',
      'rental_records',
      'rental_events',
      'department_orders'
    ]
    loop
      if to_regclass(format('public.%I', table_name)) is not null
         and not exists (
           select 1
           from pg_catalog.pg_publication_tables published_table
           where published_table.pubname = 'supabase_realtime'
             and published_table.schemaname = 'public'
             and published_table.tablename = table_name
         ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
