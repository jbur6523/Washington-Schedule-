-- The command-center (Sputum) login is intentionally shared. Allow it to
-- reply through the same narrow, attributed pathway used by Leadership,
-- including when the root note was created through that shared login.
-- Shared read/unread behavior is unchanged.

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
  note_department_id uuid;
  replied_at timestamptz := clock_timestamp();
begin
  reply_text := btrim(coalesce(reply_text, ''));

  if char_length(reply_text) < 1 or char_length(reply_text) > 500 then
    raise exception 'lead_communication_reply_invalid'
      using errcode = '22023';
  end if;

  select note.department_id
  into note_department_id
  from public.lead_communication_notes note
  where note.id = target_note_id
    and note.status <> 'closed'
    and note.follow_up_text is null;

  if not found then
    raise exception 'lead_communication_reply_not_available'
      using errcode = 'P0001';
  end if;

  select staff.*
  into actor_staff
  from public.staff_profiles staff
  where staff.profile_id = public.current_profile_id()
    and staff.department_id = note_department_id
    and staff.operations_role in ('leadership', 'command_center')
    and staff.is_active = true;

  if not found then
    raise exception 'lead_communication_reply_access_required'
      using errcode = '42501';
  end if;

  update public.lead_communication_notes note
  set
    follow_up_text = reply_text,
    followed_up_at = replied_at,
    followed_up_by_staff_profile_id = actor_staff.id,
    followed_up_by_name = actor_staff.display_name
  where note.id = target_note_id
    and note.department_id = note_department_id
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
