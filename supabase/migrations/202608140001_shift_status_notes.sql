alter table public.shift_status_updates
  add column if not exists shift_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.shift_status_updates'::regclass
      and conname = 'shift_status_note_length'
  ) then
    alter table public.shift_status_updates
      add constraint shift_status_note_length
      check (shift_note is null or char_length(shift_note) <= 500);
  end if;
end $$;

comment on column public.shift_status_updates.shift_note is
  'Optional operational note for the reporting-window shift; must not contain patient information.';
