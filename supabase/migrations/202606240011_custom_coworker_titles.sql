alter table public.coworker_titles
  add column if not exists title_key text,
  add column if not exists custom_title text,
  add column if not exists custom_icon text,
  add column if not exists is_custom boolean not null default false;

update public.coworker_titles
set title_key = title::text,
    is_custom = false
where title_key is null
  and title is not null;

alter table public.coworker_titles
  alter column title drop not null;

drop index if exists public.coworker_titles_unique_owner_target_title;

create unique index if not exists coworker_titles_unique_owner_target_preset
  on public.coworker_titles(department_id, owner_staff_profile_id, target_staff_profile_id, title_key)
  where is_custom = false;

create unique index if not exists coworker_titles_unique_owner_target_custom
  on public.coworker_titles(department_id, owner_staff_profile_id, target_staff_profile_id, lower(custom_title))
  where is_custom = true;

alter table public.coworker_titles
  drop constraint if exists coworker_titles_preset_or_custom;

alter table public.coworker_titles
  add constraint coworker_titles_preset_or_custom
  check (
    (
      is_custom = false
      and title_key in (
        'bestie',
        'work_wife',
        'work_husband',
        'ride_or_die',
        'emotional_support_coworker',
        'frenemy',
        'trauma_bonded'
      )
      and custom_title is null
      and custom_icon is null
    )
    or
    (
      is_custom = true
      and title is null
      and title_key is null
      and custom_title is not null
      and custom_icon is not null
      and length(btrim(custom_title)) between 1 and 24
      and length(btrim(custom_icon)) between 1 and 4
    )
  );

create or replace function public.enforce_coworker_custom_title_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_custom then
    if (
      select count(*)
      from public.coworker_titles existing
      where existing.department_id = new.department_id
        and existing.owner_staff_profile_id = new.owner_staff_profile_id
        and existing.target_staff_profile_id = new.target_staff_profile_id
        and existing.is_custom = true
        and (tg_op = 'INSERT' or existing.id <> new.id)
    ) >= 3 then
      raise exception 'A maximum of 3 custom coworker titles is allowed per coworker.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists coworker_titles_custom_title_limit on public.coworker_titles;
create trigger coworker_titles_custom_title_limit
  before insert or update on public.coworker_titles
  for each row execute function public.enforce_coworker_custom_title_limit();
