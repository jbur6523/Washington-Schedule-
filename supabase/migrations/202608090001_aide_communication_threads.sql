alter table public.rt_aide_notes
  add column if not exists conversation_direction text not null default 'to_aides';

alter table public.rt_aide_notes
  drop constraint if exists rt_aide_notes_conversation_direction_check;

alter table public.rt_aide_notes
  add constraint rt_aide_notes_conversation_direction_check
  check (conversation_direction in ('to_aides', 'to_leads'));

create table if not exists public.rt_aide_note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.rt_aide_notes(id) on delete cascade,
  reply_text text not null,
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  constraint rt_aide_note_replies_text_length check (char_length(reply_text) between 1 and 500),
  constraint rt_aide_note_replies_author_length check (
    created_by_name is null or char_length(created_by_name) between 1 and 80
  )
);

create index if not exists rt_aide_note_replies_note_created_idx
  on public.rt_aide_note_replies(note_id, created_at);

insert into public.rt_aide_note_replies (
  note_id,
  reply_text,
  created_by_staff_profile_id,
  created_by_name,
  created_at
)
select
  note.id,
  note.response_text,
  note.responded_by_staff_profile_id,
  nullif(btrim(note.responded_by_name), ''),
  coalesce(note.responded_at, note.updated_at, note.created_at)
from public.rt_aide_notes note
where note.response_text is not null
  and btrim(note.response_text) <> ''
  and not exists (
    select 1
    from public.rt_aide_note_replies reply
    where reply.note_id = note.id
  );

create or replace function public.sync_rt_aide_note_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rt_aide_notes
  set
    status = 'responded',
    response_text = new.reply_text,
    responded_at = new.created_at,
    responded_by_staff_profile_id = new.created_by_staff_profile_id,
    responded_by_name = new.created_by_name,
    acknowledged_at = coalesce(acknowledged_at, new.created_at),
    acknowledged_by_staff_profile_id = coalesce(
      acknowledged_by_staff_profile_id,
      new.created_by_staff_profile_id
    ),
    acknowledged_by_name = coalesce(acknowledged_by_name, new.created_by_name)
  where id = new.note_id
    and status <> 'closed';

  if not found then
    raise exception 'Cannot reply to an archived aide communication note';
  end if;

  return new;
end;
$$;

drop trigger if exists rt_aide_note_reply_sync_parent on public.rt_aide_note_replies;
create trigger rt_aide_note_reply_sync_parent
  after insert on public.rt_aide_note_replies
  for each row execute function public.sync_rt_aide_note_reply();

alter table public.rt_aide_note_replies enable row level security;

drop policy if exists "RT communication participants can read replies" on public.rt_aide_note_replies;
create policy "RT communication participants can read replies"
  on public.rt_aide_note_replies
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.rt_aide_notes note
      where note.id = rt_aide_note_replies.note_id
        and (
          public.user_is_department_admin(note.department_id)
          or public.user_is_department_lead(note.department_id)
          or public.user_is_command_center(note.department_id)
          or public.user_is_department_aide(note.department_id)
        )
    )
  );

drop policy if exists "RT communication participants can create replies" on public.rt_aide_note_replies;
create policy "RT communication participants can create replies"
  on public.rt_aide_note_replies
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.rt_aide_notes note
      where note.id = rt_aide_note_replies.note_id
        and note.status <> 'closed'
        and rt_aide_note_replies.created_by_staff_profile_id = public.current_staff_profile_id(note.department_id)
        and (
          public.user_is_department_admin(note.department_id)
          or public.user_is_department_lead(note.department_id)
          or public.user_is_command_center(note.department_id)
          or public.user_is_department_aide(note.department_id)
        )
    )
  );

drop policy if exists "RT Command Center users can create aide notes" on public.rt_aide_notes;
drop policy if exists "RT communication participants can create notes" on public.rt_aide_notes;
create policy "RT communication participants can create notes"
  on public.rt_aide_notes
  for insert
  to authenticated
  with check (
    created_by_staff_profile_id = public.current_staff_profile_id(department_id)
    and status = 'new'
    and (
      (
        conversation_direction = 'to_aides'
        and (
          public.user_is_department_admin(department_id)
          or public.user_is_department_lead(department_id)
          or public.user_is_command_center(department_id)
        )
      )
      or
      (
        conversation_direction = 'to_leads'
        and (
          public.user_is_department_admin(department_id)
          or public.user_is_department_aide(department_id)
        )
      )
    )
  );

grant select, insert on public.rt_aide_note_replies to authenticated;
