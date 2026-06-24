do $$
begin
  alter type public.app_role add value if not exists 'lead';
exception
  when duplicate_object then null;
end $$;

create or replace function public.normalize_username(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]', '', 'g');
$$;

create or replace function public.generated_staff_username_base(display_name text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
  first_name text;
  last_name text;
  first_clean text;
  last_clean text;
begin
  parts := regexp_split_to_array(trim(regexp_replace(coalesce(display_name, ''), '[^[:alnum:][:space:]''-]', ' ', 'g')), '\s+');
  first_name := coalesce(parts[1], '');
  last_name := coalesce(parts[array_length(parts, 1)], first_name);
  first_clean := public.normalize_username(first_name);
  last_clean := public.normalize_username(last_name);

  if first_clean = 'bei' and last_clean = 'yi' then
    return 'yibe';
  end if;

  if first_clean = 'pawanjit' and last_clean = 'khera' then
    return 'pawk';
  end if;

  return left(last_clean, 3) || left(first_clean, 1);
end;
$$;

alter table public.staff_profiles
  add column if not exists username text,
  add column if not exists username_normalized text,
  add column if not exists account_claimed_at timestamptz,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists password_reset_required boolean not null default false,
  add column if not exists assigned_role public.app_role not null default 'staff';

alter table public.staff_profiles
  drop constraint if exists staff_profiles_admin_username_check;

alter table public.staff_profiles
  add constraint staff_profiles_admin_username_check
  check (assigned_role::text <> 'admin' or username_normalized = 'burj');

with generated as (
  select
    id,
    public.generated_staff_username_base(display_name) as base_username
  from public.staff_profiles
  where username_normalized is null
),
numbered as (
  select
    id,
    case
      when row_number() over (partition by base_username order by id) = 1 then base_username
      else base_username || row_number() over (partition by base_username order by id)::text
    end as assigned_username
  from generated
)
update public.staff_profiles sp
set
  username = numbered.assigned_username,
  username_normalized = public.normalize_username(numbered.assigned_username)
from numbered
where sp.id = numbered.id;

update public.staff_profiles
set username_normalized = public.normalize_username(username)
where username is not null
  and username_normalized is distinct from public.normalize_username(username);

update public.staff_profiles
set assigned_role = 'staff'
where assigned_role is null;

update public.staff_profiles
set assigned_role = 'lead'
where public.normalize_username(display_name) in (
  'allantimbang',
  'heatherheath',
  'tomnguyen',
  'winhlaing',
  'beiyi',
  'katrynavuong',
  'joanndevera',
  'victordavis',
  'jeanrodrillo',
  'genebenoza',
  'stephanieortiz'
)
and username_normalized <> 'burj';

update public.staff_profiles
set assigned_role = 'admin'
where username_normalized = 'burj'
  and public.normalize_username(display_name) = 'jonathanburdick';

create unique index if not exists staff_profiles_department_username_normalized_unique
  on public.staff_profiles(department_id, username_normalized)
  where username_normalized is not null;

create unique index if not exists staff_profiles_auth_user_id_unique
  on public.staff_profiles(auth_user_id)
  where auth_user_id is not null;

create or replace function public.user_is_department_lead(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_memberships dm
    where dm.department_id = target_department_id
      and dm.profile_id = public.current_profile_id()
      and dm.role::text in ('admin', 'lead')
  );
$$;

grant execute on function public.user_is_department_lead(uuid) to authenticated;

create policy "Department leads can manage shift shortages"
  on public.shift_shortages
  for all
  to authenticated
  using (public.user_is_department_lead(department_id))
  with check (public.user_is_department_lead(department_id));
