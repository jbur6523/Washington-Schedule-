-- The Sputum command-center login is shared by multiple people. Unlike the
-- normal Lead/Admin board-entry acknowledgement, its notes are explicitly
-- marked read or unread by a person using the shared account.

create or replace function public.set_command_center_lead_communication_read_state(
  target_note_id uuid,
  mark_read boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_staff public.staff_profiles%rowtype;
  note_department_id uuid;
  changed_at timestamptz := clock_timestamp();
begin
  select note.department_id
  into note_department_id
  from public.lead_communication_notes note
  where note.id = target_note_id
    and note.status <> 'closed';

  if not found then
    raise exception 'lead_communication_note_not_available'
      using errcode = 'P0001';
  end if;

  select staff.*
  into actor_staff
  from public.staff_profiles staff
  where staff.profile_id = public.current_profile_id()
    and staff.department_id = note_department_id
    and staff.operations_role = 'command_center'
    and staff.is_active = true;

  if not found then
    raise exception 'lead_communication_read_access_required'
      using errcode = '42501';
  end if;

  update public.lead_communication_notes note
  set
    status = case when mark_read then 'reviewed' else 'new' end,
    reviewed_at = case
      when mark_read then coalesce(note.reviewed_at, changed_at)
      else note.reviewed_at
    end,
    reviewed_by_staff_profile_id = case
      when mark_read then coalesce(note.reviewed_by_staff_profile_id, actor_staff.id)
      else note.reviewed_by_staff_profile_id
    end,
    reviewed_by_name = case
      when mark_read then coalesce(note.reviewed_by_name, actor_staff.display_name)
      else note.reviewed_by_name
    end
  where note.id = target_note_id
    and note.department_id = note_department_id
    and note.status <> 'closed';

  if not found then
    raise exception 'lead_communication_note_not_available'
      using errcode = 'P0001';
  end if;

  return true;
end;
$$;

revoke all on function public.set_command_center_lead_communication_read_state(uuid, boolean)
  from public, anon;
grant execute on function public.set_command_center_lead_communication_read_state(uuid, boolean)
  to authenticated;
