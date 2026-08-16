\set ON_ERROR_STOP on

begin;

insert into public.hospitals (id, name)
values ('92000000-0000-0000-0000-000000000001', 'Lead Communication Test Hospital');

insert into public.departments (id, hospital_id, name, timezone)
values (
  '92000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000001',
  'Lead Communication Test Department',
  'America/Los_Angeles'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  '92000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'lead-communication-sputum@audit.invalid',
  '',
  now(),
  now(),
  now()
);

insert into public.profiles (id, auth_user_id, display_name, email)
values (
  '92000000-0000-0000-0000-000000000004',
  '92000000-0000-0000-0000-000000000003',
  'Respiratory Command Center',
  'lead-communication-sputum@audit.invalid'
);

insert into public.staff_profiles (
  id, department_id, profile_id, auth_user_id, display_name, username,
  username_normalized, assigned_role, operations_role, employment_type,
  home_assignment, is_active, account_claimed_at
)
values (
  '92000000-0000-0000-0000-000000000005',
  '92000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000004',
  '92000000-0000-0000-0000-000000000003',
  'Respiratory Command Center',
  'sputumreplytest',
  'sputumreplytest',
  'staff',
  'command_center',
  'full_time',
  'day_shift',
  true,
  now()
);

insert into public.lead_communication_notes (
  id,
  department_id,
  note_text,
  priority,
  status,
  created_by_staff_profile_id,
  created_by_name
)
values (
  '92000000-0000-0000-0000-000000000006',
  '92000000-0000-0000-0000-000000000002',
  'Self-authored shared-login note',
  'urgent',
  'new',
  '92000000-0000-0000-0000-000000000005',
  'Respiratory Command Center'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000003', true);

select public.set_command_center_lead_communication_read_state(
  '92000000-0000-0000-0000-000000000006',
  true
);

do $$
begin
  if not exists (
    select 1
    from public.lead_communication_notes note
    where note.id = '92000000-0000-0000-0000-000000000006'
      and note.status = 'reviewed'
      and note.reviewed_by_staff_profile_id = '92000000-0000-0000-0000-000000000005'
      and note.reviewed_at is not null
  ) then
    raise exception 'Shared command-center Mark as Read failed';
  end if;
end;
$$;

select public.set_command_center_lead_communication_read_state(
  '92000000-0000-0000-0000-000000000006',
  false
);

do $$
begin
  if not exists (
    select 1
    from public.lead_communication_notes note
    where note.id = '92000000-0000-0000-0000-000000000006'
      and note.status = 'new'
      and note.reviewed_at is not null
  ) then
    raise exception 'Shared command-center Mark Unread failed or erased review history';
  end if;
end;
$$;

select public.reply_to_lead_communication_note(
  '92000000-0000-0000-0000-000000000006',
  'Reply from another person using the shared login'
);

do $$
begin
  if not exists (
    select 1
    from public.lead_communication_notes note
    where note.id = '92000000-0000-0000-0000-000000000006'
      and note.created_by_staff_profile_id = '92000000-0000-0000-0000-000000000005'
      and note.followed_up_by_staff_profile_id = '92000000-0000-0000-0000-000000000005'
      and note.follow_up_text = 'Reply from another person using the shared login'
      and note.status = 'new'
      and note.priority = 'urgent'
  ) then
    raise exception 'Shared command-center reply failed or altered read/priority state';
  end if;
end;
$$;

rollback;
