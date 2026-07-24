create table public.phone_list_drafts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  schedule_date date not null,
  shift_type text not null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_name text,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phone_list_drafts_shift_type_check check (shift_type in ('day', 'night')),
  constraint phone_list_drafts_created_by_name_length
    check (created_by_name is null or char_length(created_by_name) <= 120),
  constraint phone_list_drafts_updated_by_name_length
    check (updated_by_name is null or char_length(updated_by_name) <= 120),
  constraint phone_list_drafts_department_date_shift_unique
    unique (department_id, schedule_date, shift_type)
);

create table public.phone_list_assignments (
  id uuid primary key default gen_random_uuid(),
  phone_list_draft_id uuid not null references public.phone_list_drafts(id) on delete cascade,
  row_key text not null,
  section_key text not null,
  row_label text not null,
  display_order smallint not null,
  selected_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  staff_name_snapshot text,
  phone_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phone_list_assignments_row_key_format
    check (row_key ~ '^[a-z0-9_]+$'),
  constraint phone_list_assignments_section_key_check
    check (section_key in ('main_hospital', 'morris_hyman_pavilion', 'additional_staff')),
  constraint phone_list_assignments_row_label_length
    check (char_length(row_label) between 1 and 80),
  constraint phone_list_assignments_display_order_check
    check (display_order between 1 and 31),
  constraint phone_list_assignments_staff_name_length
    check (
      staff_name_snapshot is null
      or (
        char_length(staff_name_snapshot) between 1 and 120
        and staff_name_snapshot = btrim(staff_name_snapshot)
      )
    ),
  constraint phone_list_assignments_phone_length
    check (
      phone_number is null
      or (
        char_length(phone_number) between 1 and 30
        and phone_number = btrim(phone_number)
      )
    ),
  constraint phone_list_assignments_draft_row_unique
    unique (phone_list_draft_id, row_key),
  constraint phone_list_assignments_draft_order_unique
    unique (phone_list_draft_id, display_order)
);

create index phone_list_drafts_department_date_idx
  on public.phone_list_drafts(department_id, schedule_date desc, shift_type);

create index phone_list_assignments_draft_order_idx
  on public.phone_list_assignments(phone_list_draft_id, display_order);

create index phone_list_assignments_selected_staff_idx
  on public.phone_list_assignments(selected_staff_profile_id)
  where selected_staff_profile_id is not null;

drop trigger if exists phone_list_drafts_set_updated_at on public.phone_list_drafts;
create trigger phone_list_drafts_set_updated_at
  before update on public.phone_list_drafts
  for each row execute function public.set_updated_at();

drop trigger if exists phone_list_assignments_set_updated_at on public.phone_list_assignments;
create trigger phone_list_assignments_set_updated_at
  before update on public.phone_list_assignments
  for each row execute function public.set_updated_at();

alter table public.phone_list_drafts enable row level security;
alter table public.phone_list_assignments enable row level security;

create policy "Lead Command Board users can read phone list drafts"
  on public.phone_list_drafts
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
  );

create policy "Lead Command Board users can read phone list assignments"
  on public.phone_list_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.phone_list_drafts draft
      where draft.id = phone_list_assignments.phone_list_draft_id
        and (
          public.user_is_department_admin(draft.department_id)
          or public.user_is_department_lead(draft.department_id)
          or public.user_is_command_center(draft.department_id)
        )
    )
  );

grant select on public.phone_list_drafts to authenticated;
grant select on public.phone_list_assignments to authenticated;

create or replace function public.save_phone_list_draft(
  p_department_id uuid,
  p_schedule_date date,
  p_shift_type text,
  p_assignments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile_id uuid;
  v_actor_name text;
  v_draft_id uuid;
  v_invalid_row_key text;
  v_duplicate_row_key text;
  v_invalid_staff_profile_id uuid;
  v_conflicting_identity text;
  v_allowed_row_keys constant text[] := array[
    'main_lead_therapist',
    'main_rapid_response',
    'main_ijr',
    'main_special_care_nursery',
    'main_2w_2s',
    'main_pediatrics_2north',
    'main_3n_3e',
    'main_3_west',
    'main_4_west',
    'main_5w',
    'main_6w',
    'main_ekg',
    'main_abg',
    'main_or_pacu_cath_lab',
    'main_bronch',
    'mhp_rapid_response',
    'mhp_er',
    'mhp_abg',
    'mhp_ekg',
    'mhp_ccu_rt_resource',
    'mhp_ccu_a_imc',
    'mhp_ccu_b_imc',
    'mhp_ccu_b',
    'mhp_ccu_c',
    'mhp_ccu_d',
    'mhp_ccu_e',
    'mhp_3_oncology',
    'mhp_3_telemetry',
    'additional_staff_1',
    'additional_staff_2',
    'additional_staff_3'
  ]::text[];
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  v_profile_id := public.current_profile_id();

  if v_profile_id is null or not public.user_is_department_member(p_department_id) then
    raise exception using errcode = '42501', message = 'Department membership is required.';
  end if;

  if not (
    public.user_is_department_admin(p_department_id)
    or public.user_is_department_lead(p_department_id)
    or public.user_is_command_center(p_department_id)
  ) then
    raise exception using errcode = '42501', message = 'Lead Command Board access is required.';
  end if;

  if p_schedule_date is null then
    raise exception using errcode = '22023', message = 'A phone-list date is required.';
  end if;

  if p_shift_type is null or p_shift_type not in ('day', 'night') then
    raise exception using errcode = '22023', message = 'The phone-list shift is invalid.';
  end if;

  if p_assignments is null or pg_catalog.jsonb_typeof(p_assignments) <> 'array' then
    raise exception using errcode = '22023', message = 'Phone-list assignments must be a JSON array.';
  end if;

  if pg_catalog.jsonb_array_length(p_assignments) > 31 then
    raise exception using errcode = '22023', message = 'The phone list contains too many assignment rows.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_assignments) as item(
      row_key text,
      selected_staff_profile_id uuid,
      staff_name_snapshot text,
      phone_number text
    )
    where item.row_key is null
  ) then
    raise exception using errcode = '22023', message = 'The phone list contains an invalid assignment row.';
  end if;

  select item.row_key
  into v_invalid_row_key
  from pg_catalog.jsonb_to_recordset(p_assignments) as item(
    row_key text,
    selected_staff_profile_id uuid,
    staff_name_snapshot text,
    phone_number text
  )
  where not (item.row_key = any (v_allowed_row_keys))
  limit 1;

  if v_invalid_row_key is not null then
    raise exception using errcode = '22023', message = 'The phone list contains an invalid assignment row.';
  end if;

  select item.row_key
  into v_duplicate_row_key
  from pg_catalog.jsonb_to_recordset(p_assignments) as item(
    row_key text,
    selected_staff_profile_id uuid,
    staff_name_snapshot text,
    phone_number text
  )
  group by item.row_key
  having count(*) > 1
  limit 1;

  if v_duplicate_row_key is not null then
    raise exception using errcode = '23505', message = 'The phone list contains a duplicate assignment row.';
  end if;

  select item.selected_staff_profile_id
  into v_invalid_staff_profile_id
  from pg_catalog.jsonb_to_recordset(p_assignments) as item(
    row_key text,
    selected_staff_profile_id uuid,
    staff_name_snapshot text,
    phone_number text
  )
  left join public.staff_profiles staff
    on staff.id = item.selected_staff_profile_id
    and staff.department_id = p_department_id
  where item.selected_staff_profile_id is not null
    and staff.id is null
  limit 1;

  if v_invalid_staff_profile_id is not null then
    raise exception using errcode = '23503', message = 'A selected staff member is not in this department.';
  end if;

  select normalized.identity_key
  into v_conflicting_identity
  from (
    select
      case
        when item.selected_staff_profile_id is not null
          then 'staff:' || item.selected_staff_profile_id::text
        when nullif(pg_catalog.btrim(item.staff_name_snapshot), '') is not null
          then 'manual:' || pg_catalog.lower(
            pg_catalog.regexp_replace(pg_catalog.btrim(item.staff_name_snapshot), '\s+', ' ', 'g')
          )
        else null
      end as identity_key,
      nullif(pg_catalog.btrim(item.phone_number), '') as phone_number
    from pg_catalog.jsonb_to_recordset(p_assignments) as item(
      row_key text,
      selected_staff_profile_id uuid,
      staff_name_snapshot text,
      phone_number text
    )
  ) normalized
  where normalized.identity_key is not null
  group by normalized.identity_key
  having count(distinct normalized.phone_number) > 1
  limit 1;

  if v_conflicting_identity is not null then
    raise exception using errcode = '23514', message = 'One person has conflicting phone numbers in this draft.';
  end if;

  select profile.display_name
  into v_actor_name
  from public.profiles profile
  where profile.id = v_profile_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_department_id::text || ':' || p_schedule_date::text || ':' || p_shift_type,
      0
    )
  );

  insert into public.phone_list_drafts (
    department_id,
    schedule_date,
    shift_type,
    created_by_profile_id,
    created_by_name,
    updated_by_profile_id,
    updated_by_name
  )
  values (
    p_department_id,
    p_schedule_date,
    p_shift_type,
    v_profile_id,
    v_actor_name,
    v_profile_id,
    v_actor_name
  )
  on conflict (department_id, schedule_date, shift_type)
  do update set
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_by_name = excluded.updated_by_name,
    updated_at = pg_catalog.now()
  returning id into v_draft_id;

  delete from public.phone_list_assignments
  where phone_list_draft_id = v_draft_id;

  with canonical(row_key, section_key, row_label, display_order) as (
    values
      ('main_lead_therapist', 'main_hospital', 'Lead Therapist', 1),
      ('main_rapid_response', 'main_hospital', 'Rapid Response', 2),
      ('main_ijr', 'main_hospital', 'IJR', 3),
      ('main_special_care_nursery', 'main_hospital', 'Special Care Nursery', 4),
      ('main_2w_2s', 'main_hospital', '2W/2S', 5),
      ('main_pediatrics_2north', 'main_hospital', 'Pediatrics 2North', 6),
      ('main_3n_3e', 'main_hospital', '3N/3E', 7),
      ('main_3_west', 'main_hospital', '3 WEST', 8),
      ('main_4_west', 'main_hospital', '4 WEST', 9),
      ('main_5w', 'main_hospital', '5W', 10),
      ('main_6w', 'main_hospital', '6W', 11),
      ('main_ekg', 'main_hospital', 'EKG', 12),
      ('main_abg', 'main_hospital', 'ABG', 13),
      ('main_or_pacu_cath_lab', 'main_hospital', 'OR/PACU/Cath Lab', 14),
      ('main_bronch', 'main_hospital', 'BRONCH', 15),
      ('mhp_rapid_response', 'morris_hyman_pavilion', 'RAPID RESPONSE', 16),
      ('mhp_er', 'morris_hyman_pavilion', 'ER', 17),
      ('mhp_abg', 'morris_hyman_pavilion', 'MHP-ABG', 18),
      ('mhp_ekg', 'morris_hyman_pavilion', 'MHP-EKG', 19),
      ('mhp_ccu_rt_resource', 'morris_hyman_pavilion', 'CCU-RT RESOURCE', 20),
      ('mhp_ccu_a_imc', 'morris_hyman_pavilion', 'CCU-A IMC', 21),
      ('mhp_ccu_b_imc', 'morris_hyman_pavilion', 'CCU-B IMC', 22),
      ('mhp_ccu_b', 'morris_hyman_pavilion', 'CCU-B', 23),
      ('mhp_ccu_c', 'morris_hyman_pavilion', 'CCU-C', 24),
      ('mhp_ccu_d', 'morris_hyman_pavilion', 'CCU-D', 25),
      ('mhp_ccu_e', 'morris_hyman_pavilion', 'CCU-E', 26),
      ('mhp_3_oncology', 'morris_hyman_pavilion', '3-ONCOLOGY', 27),
      ('mhp_3_telemetry', 'morris_hyman_pavilion', '3-TELEMETRY', 28),
      ('additional_staff_1', 'additional_staff', 'ADDITIONAL STAFF', 29),
      ('additional_staff_2', 'additional_staff', 'ADDITIONAL STAFF', 30),
      ('additional_staff_3', 'additional_staff', 'ADDITIONAL STAFF', 31)
  ),
  payload as (
    select *
    from pg_catalog.jsonb_to_recordset(p_assignments) as item(
      row_key text,
      selected_staff_profile_id uuid,
      staff_name_snapshot text,
      phone_number text
    )
  ),
  resolved as (
    select
      canonical.row_key,
      canonical.section_key,
      canonical.row_label,
      canonical.display_order,
      payload.selected_staff_profile_id,
      case
        when payload.selected_staff_profile_id is not null then staff.display_name
        else nullif(pg_catalog.btrim(payload.staff_name_snapshot), '')
      end as staff_name_snapshot,
      nullif(pg_catalog.btrim(payload.phone_number), '') as phone_number,
      case
        when payload.selected_staff_profile_id is not null
          then 'staff:' || payload.selected_staff_profile_id::text
        when nullif(pg_catalog.btrim(payload.staff_name_snapshot), '') is not null
          then 'manual:' || pg_catalog.lower(
            pg_catalog.regexp_replace(pg_catalog.btrim(payload.staff_name_snapshot), '\s+', ' ', 'g')
          )
        else null
      end as identity_key
    from canonical
    left join payload on payload.row_key = canonical.row_key
    left join public.staff_profiles staff
      on staff.id = payload.selected_staff_profile_id
      and staff.department_id = p_department_id
  ),
  remembered_phones as (
    select identity_key, max(phone_number) as phone_number
    from resolved
    where identity_key is not null
      and phone_number is not null
    group by identity_key
  )
  insert into public.phone_list_assignments (
    phone_list_draft_id,
    row_key,
    section_key,
    row_label,
    display_order,
    selected_staff_profile_id,
    staff_name_snapshot,
    phone_number
  )
  select
    v_draft_id,
    resolved.row_key,
    resolved.section_key,
    resolved.row_label,
    resolved.display_order,
    resolved.selected_staff_profile_id,
    resolved.staff_name_snapshot,
    coalesce(resolved.phone_number, remembered_phones.phone_number)
  from resolved
  left join remembered_phones on remembered_phones.identity_key = resolved.identity_key
  order by resolved.display_order;

  return v_draft_id;
end;
$$;

revoke all on function public.save_phone_list_draft(uuid, date, text, jsonb) from public;
revoke all on function public.save_phone_list_draft(uuid, date, text, jsonb) from anon;
grant execute on function public.save_phone_list_draft(uuid, date, text, jsonb) to authenticated;
