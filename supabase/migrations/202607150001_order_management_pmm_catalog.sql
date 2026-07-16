create table if not exists public.pmm_catalog (
  id uuid primary key default gen_random_uuid(),
  pmm_number text not null unique,
  item_name text not null,
  category text null,
  vendor_catalog_number text null,
  vendor text null,
  catalog_status text not null default 'active',
  is_orderable boolean not null default true,
  review_required boolean not null default false,
  confidence text not null default 'high',
  alternate_descriptions text[] not null default array[]::text[],
  notes text null,
  source_files text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pmm_catalog_pmm_number_format check (pmm_number ~ '^[0-9]+$'),
  constraint pmm_catalog_item_name_present check (nullif(btrim(item_name), '') is not null),
  constraint pmm_catalog_status_valid check (catalog_status in ('active', 'discontinued', 'do_not_use')),
  constraint pmm_catalog_confidence_valid check (confidence in ('high', 'medium', 'low'))
);

create index if not exists pmm_catalog_item_name_idx
  on public.pmm_catalog using gin (to_tsvector('english', item_name));

drop trigger if exists pmm_catalog_set_updated_at on public.pmm_catalog;
create trigger pmm_catalog_set_updated_at
  before update on public.pmm_catalog
  for each row execute function public.set_updated_at();

create table if not exists public.department_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.department_orders(id) on delete cascade,
  line_type text not null,
  pmm_number text null references public.pmm_catalog(pmm_number) on update cascade on delete restrict,
  item_name_snapshot text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_order_lines_type_valid check (line_type in ('pmm', 'non_catalog')),
  constraint department_order_lines_shape_valid check (
    (line_type = 'pmm' and pmm_number is not null)
    or (line_type = 'non_catalog' and pmm_number is null)
  ),
  constraint department_order_lines_item_name_present check (
    nullif(btrim(item_name_snapshot), '') is not null
    and char_length(item_name_snapshot) <= 500
  ),
  constraint department_order_lines_sort_order_valid check (sort_order >= 0)
);

create unique index if not exists department_order_lines_order_sort_idx
  on public.department_order_lines(order_id, sort_order);

create unique index if not exists department_order_lines_unique_pmm_per_order_idx
  on public.department_order_lines(order_id, pmm_number)
  where line_type = 'pmm';

create index if not exists department_order_lines_pmm_number_idx
  on public.department_order_lines(pmm_number)
  where pmm_number is not null;

drop trigger if exists department_order_lines_set_updated_at on public.department_order_lines;
create trigger department_order_lines_set_updated_at
  before update on public.department_order_lines
  for each row execute function public.set_updated_at();

create or replace function public.user_has_order_management_access()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.department_memberships dm
    where auth.uid() is not null
      and dm.profile_id = public.current_profile_id()
      and (
        dm.role = 'admin'
        or exists (
          select 1
          from public.staff_profiles sp
          where sp.department_id = dm.department_id
            and sp.profile_id = dm.profile_id
            and sp.operations_role = 'aide'
        )
      )
  );
$$;

revoke all on function public.user_has_order_management_access() from public;
revoke all on function public.user_has_order_management_access() from anon;
grant execute on function public.user_has_order_management_access() to authenticated;

alter table public.pmm_catalog enable row level security;
alter table public.department_order_lines enable row level security;

drop policy if exists "Order Management users can read PMM catalog" on public.pmm_catalog;
create policy "Order Management users can read PMM catalog"
  on public.pmm_catalog
  for select
  to authenticated
  using (public.user_has_order_management_access());

drop policy if exists "Order Management users can read order lines" on public.department_order_lines;
create policy "Order Management users can read order lines"
  on public.department_order_lines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.department_orders department_order
      where department_order.id = department_order_lines.order_id
        and (
          public.user_is_department_aide(department_order.department_id)
          or public.user_is_department_admin(department_order.department_id)
        )
    )
  );

revoke all on public.pmm_catalog from anon;
revoke all on public.pmm_catalog from authenticated;
grant select on public.pmm_catalog to authenticated;

revoke all on public.department_order_lines from anon;
revoke all on public.department_order_lines from authenticated;
grant select on public.department_order_lines to authenticated;

alter table public.department_orders
  drop constraint if exists department_orders_image_or_note;

drop policy if exists "Aides and admins can create department orders" on public.department_orders;
drop policy if exists "Aides can create department orders" on public.department_orders;
create policy "Aides and admins can create department orders"
  on public.department_orders
  for insert
  to authenticated
  with check (
    (
      public.user_is_department_aide(department_id)
      or public.user_is_department_admin(department_id)
    )
    and created_by_staff_profile_id = public.current_staff_profile_id(department_id)
    and (
      nullif(btrim(coalesce(image_storage_path, image_url, '')), '') is not null
      or nullif(btrim(coalesce(notes, '')), '') is not null
      or nullif(btrim(coalesce(req_number, '')), '') is not null
    )
  );

create or replace function public.create_department_order_with_lines(
  p_order_id uuid,
  p_department_id uuid,
  p_req_number text,
  p_image_storage_path text,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile_id uuid;
  v_staff_profile_id uuid;
  v_created_by_name text;
  v_req_number text := nullif(pg_catalog.btrim(p_req_number), '');
  v_image_storage_path text := nullif(pg_catalog.btrim(p_image_storage_path), '');
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
  v_lines jsonb := pg_catalog.coalesce(p_lines, '[]'::jsonb);
  v_normalized_lines jsonb := '[]'::jsonb;
  v_existing_lines jsonb;
  v_existing_order public.department_orders%rowtype;
  v_catalog_row public.pmm_catalog%rowtype;
  v_line jsonb;
  v_line_type text;
  v_pmm_number text;
  v_item_name text;
  v_seen_pmms text[] := array[]::text[];
  v_ordinality bigint;
  v_image_prefix text;
begin
  if auth.uid() is null then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  if p_order_id is null or p_department_id is null then
    raise exception 'INVALID_ORDER_IDENTITY';
  end if;

  v_profile_id := public.current_profile_id();

  if v_profile_id is null or not public.user_is_department_member(p_department_id) then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  if not (
    public.user_is_department_aide(p_department_id)
    or public.user_is_department_admin(p_department_id)
  ) then
    raise exception 'ORDER_ACCESS_DENIED';
  end if;

  v_staff_profile_id := public.current_staff_profile_id(p_department_id);

  select sp.display_name
  into v_created_by_name
  from public.staff_profiles sp
  where sp.id = v_staff_profile_id
    and sp.profile_id = v_profile_id
    and sp.department_id = p_department_id;

  if v_staff_profile_id is null or v_created_by_name is null then
    raise exception 'INVALID_ORDER_ACTOR';
  end if;

  if v_req_number is not null and pg_catalog.char_length(v_req_number) > 80 then
    raise exception 'INVALID_REQ_NUMBER';
  end if;

  if v_notes is not null and pg_catalog.char_length(v_notes) > 280 then
    raise exception 'INVALID_ORDER_NOTES';
  end if;

  if pg_catalog.jsonb_typeof(v_lines) <> 'array' then
    raise exception 'INVALID_ORDER_LINES';
  end if;

  v_image_prefix := p_department_id::text || '/' || p_order_id::text || '/';

  if v_image_storage_path is not null
     and pg_catalog.left(v_image_storage_path, pg_catalog.char_length(v_image_prefix)) <> v_image_prefix then
    raise exception 'INVALID_ORDER_IMAGE_PATH';
  end if;

  for v_line, v_ordinality in
    select input_line.value, input_line.ordinality
    from pg_catalog.jsonb_array_elements(v_lines) with ordinality as input_line(value, ordinality)
  loop
    v_line_type := v_line->>'line_type';

    if v_line_type = 'pmm' then
      v_pmm_number := nullif(pg_catalog.btrim(v_line->>'pmm_number'), '');

      if v_pmm_number is null or v_pmm_number !~ '^[0-9]+$' then
        raise exception 'INVALID_PMM_NUMBER:%', pg_catalog.coalesce(v_pmm_number, '');
      end if;

      if v_pmm_number = any(v_seen_pmms) then
        raise exception 'DUPLICATE_PMM:%', v_pmm_number;
      end if;

      v_seen_pmms := pg_catalog.array_append(v_seen_pmms, v_pmm_number);
      v_normalized_lines := v_normalized_lines || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('line_type', 'pmm', 'pmm_number', v_pmm_number)
      );
    elsif v_line_type = 'non_catalog' then
      if nullif(pg_catalog.btrim(v_line->>'pmm_number'), '') is not null then
        raise exception 'INVALID_NON_CATALOG_PMM';
      end if;

      v_item_name := nullif(pg_catalog.btrim(v_line->>'item_name'), '');

      if v_item_name is null or pg_catalog.char_length(v_item_name) > 500 then
        raise exception 'INVALID_NON_CATALOG_ITEM';
      end if;

      v_normalized_lines := v_normalized_lines || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('line_type', 'non_catalog', 'item_name', v_item_name)
      );
    else
      raise exception 'INVALID_ORDER_LINE_TYPE';
    end if;
  end loop;

  if pg_catalog.jsonb_array_length(v_normalized_lines) = 0
     and v_req_number is null
     and v_image_storage_path is null
     and v_notes is null then
    raise exception 'ORDER_CONTENT_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text, 0));

  select department_order.*
  into v_existing_order
  from public.department_orders department_order
  where department_order.id = p_order_id;

  if found then
    if v_existing_order.department_id <> p_department_id
       or v_existing_order.created_by_staff_profile_id is distinct from v_staff_profile_id
       or v_existing_order.req_number is distinct from v_req_number
       or v_existing_order.image_storage_path is distinct from v_image_storage_path
       or v_existing_order.image_url is not null
       or v_existing_order.notes is distinct from v_notes then
      raise exception 'ORDER_ID_REPLAY_MISMATCH';
    end if;

    select pg_catalog.coalesce(
      pg_catalog.jsonb_agg(
        case
          when order_line.line_type = 'pmm' then
            pg_catalog.jsonb_build_object('line_type', 'pmm', 'pmm_number', order_line.pmm_number)
          else
            pg_catalog.jsonb_build_object('line_type', 'non_catalog', 'item_name', order_line.item_name_snapshot)
        end
        order by order_line.sort_order
      ),
      '[]'::jsonb
    )
    into v_existing_lines
    from public.department_order_lines order_line
    where order_line.order_id = p_order_id;

    if v_existing_lines <> v_normalized_lines then
      raise exception 'ORDER_ID_REPLAY_MISMATCH';
    end if;

    return p_order_id;
  end if;

  insert into public.department_orders (
    id,
    department_id,
    created_by_staff_profile_id,
    created_by_name,
    req_number,
    image_url,
    image_storage_path,
    notes
  )
  values (
    p_order_id,
    p_department_id,
    v_staff_profile_id,
    v_created_by_name,
    v_req_number,
    null,
    v_image_storage_path,
    v_notes
  );

  for v_line, v_ordinality in
    select input_line.value, input_line.ordinality
    from pg_catalog.jsonb_array_elements(v_normalized_lines) with ordinality as input_line(value, ordinality)
  loop
    v_line_type := v_line->>'line_type';

    if v_line_type = 'pmm' then
      v_pmm_number := v_line->>'pmm_number';

      select catalog.*
      into v_catalog_row
      from public.pmm_catalog catalog
      where catalog.pmm_number = v_pmm_number;

      if not found then
        raise exception 'UNKNOWN_PMM:%', v_pmm_number;
      end if;

      if v_catalog_row.catalog_status <> 'active' or not v_catalog_row.is_orderable then
        raise exception 'PMM_NOT_ORDERABLE:%', v_pmm_number;
      end if;

      insert into public.department_order_lines (
        order_id,
        line_type,
        pmm_number,
        item_name_snapshot,
        sort_order
      )
      values (
        p_order_id,
        'pmm',
        v_pmm_number,
        v_catalog_row.item_name,
        (v_ordinality - 1)::integer
      );
    else
      insert into public.department_order_lines (
        order_id,
        line_type,
        pmm_number,
        item_name_snapshot,
        sort_order
      )
      values (
        p_order_id,
        'non_catalog',
        null,
        v_line->>'item_name',
        (v_ordinality - 1)::integer
      );
    end if;
  end loop;

  return p_order_id;
end;
$$;

revoke all on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) from anon;
grant execute on function public.create_department_order_with_lines(uuid, uuid, text, text, text, jsonb) to authenticated;

-- PMM CATALOG SEED
-- Contains one row per resolved PMM number.
-- Unknown/conflicting rows are intentionally kept in pmm_catalog_needs_review.csv.
-- This file expects public.pmm_catalog to exist with the reference columns.
-- Codex should place the adapted upsert in the next unused forward-only migration.

insert into public.pmm_catalog (
  pmm_number,
  item_name,
  category,
  vendor_catalog_number,
  vendor,
  catalog_status,
  is_orderable,
  review_required,
  confidence,
  alternate_descriptions,
  notes,
  source_files
)
values
  ('28', 'Gauze sponges', 'Bronchoscopy', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105744.jpg']::text[]),
  ('68', 'Hand-held nebulizer', 'Treatment Supplies', NULL, NULL, 'discontinued', false, false, 'high', ARRAY[]::text[], 'Reference sheet says discontinue use.', ARRAY['20260715_105651.jpg']::text[]),
  ('162', 'Humidifier condenser Aqua Gibeck Humid-Flo', 'Vent Supplies', 'HU19912A', NULL, 'active', true, false, 'high', ARRAY['HME']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_114510.jpg']::text[]),
  ('330', 'ConMed ECG electrodes', 'Pulmonary Rehab', NULL, NULL, 'active', true, false, 'high', ARRAY['New ECG by box']::text[], NULL, ARRAY['20260715_105702.jpg']::text[]),
  ('360', 'Humidifier condenser', 'Oxygen Supplies', 'HUDRHP340U', NULL, 'active', true, false, 'high', ARRAY['Bubble humidifier']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114439.jpg', '20260715_114550.jpg']::text[]),
  ('415', 'Mask, oxygen, adult', 'Oxygen Supplies', 'HUDRHO41U', NULL, 'active', true, false, 'high', ARRAY['Adult O2 simple mask']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_113226.jpg', '20260715_114416.jpg', '20260715_114612.jpg']::text[]),
  ('461', 'Jet nebulizer', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('653', 'Connector nylon 1/4 straight', 'Oxygen Supplies', '363', NULL, 'active', true, false, 'high', ARRAY['O2 tubing connector']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114439.jpg']::text[]),
  ('690', 'IV solution irrigation 0.9% NaCl 500 mL', 'Bronchoscopy', 'PR5201-01', NULL, 'active', true, false, 'high', ARRAY['Sodium chloride 500 mL']::text[], NULL, ARRAY['20260715_105744.jpg', '20260715_114457.jpg']::text[]),
  ('735', 'Trach Care double swivel elbow, 14 Fr', 'Vent Supplies', '2210', NULL, 'active', true, false, 'high', ARRAY['Closed suction system endotracheal']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_114416.jpg']::text[]),
  ('878', 'Specimen trap sterile mucus, 40 cc', 'Bronchoscopy', 'BW406', NULL, 'active', true, false, 'high', ARRAY['Sputum trap']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_114502.jpg']::text[]),
  ('913', 'Q-tips', 'Bronchoscopy', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105744.jpg']::text[]),
  ('978', 'Resuscitator adult small with inflatable bag reservoir', 'Vent Supplies', '5236110B', NULL, 'active', true, false, 'high', ARRAY['Ambu bags']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_113239.jpg', '20260715_114446.jpg', '20260715_114622.jpg']::text[]),
  ('1044', 'Trach suction closed, 14 Fr x 12 in', 'Vent Supplies', '220135', NULL, 'active', true, false, 'high', ARRAY['Closed suction system tracheostomy']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_114416.jpg']::text[]),
  ('1091', 'Mallinckrodt Hi-Lo oral/nasal 6 mm trach tube, cuffed', 'Airway & Intubation', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('1093', 'Mallinckrodt Hi-Lo oral/nasal 7 mm trach tube, cuffed', 'Airway & Intubation', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('1094', 'Mallinckrodt Hi-Lo oral/nasal 8 mm trach tube, cuffed', 'Airway & Intubation', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('1097', 'Corrugated tubing', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('1144', 'Specimen container', 'Bronchoscopy', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105744.jpg']::text[]),
  ('1262', 'Mouthseal', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('1263', 'Pediatric cannula', 'Pediatric', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('1311', 'Face tent mask', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('1356', 'Mask, aerosol, adult', 'Masks & Interfaces', '001206', NULL, 'active', true, false, 'high', ARRAY['Aerosol mask']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_113226.jpg', '20260715_114408.jpg', '20260715_114612.jpg']::text[]),
  ('1357', 'Mask, aerosol, pediatric', 'Pediatric', '001263', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg', '20260715_114416.jpg']::text[]),
  ('1361', 'Clip, nose, disposable plastic', 'Oxygen Supplies', '69500-300', NULL, 'active', true, false, 'high', ARRAY['Nose clips']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_113733.jpg', '20260715_114439.jpg', '20260715_114622.jpg']::text[]),
  ('1362', 'Nipple, O2 DHD', 'Oxygen Supplies', 'HUD2555', NULL, 'active', true, false, 'high', ARRAY['O2 nipple']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114432.jpg', '20260715_114550.jpg']::text[]),
  ('1516', 'Drain bag', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('1618', '5-in-1 connector', 'Bronchoscopy', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105744.jpg']::text[]),
  ('1940', 'Mask, multi-vent', 'Oxygen Supplies', 'HUD1088', NULL, 'active', true, false, 'high', ARRAY['Venti mask']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_113733.jpg', '20260715_114510.jpg']::text[]),
  ('2048', 'Trach T adapter', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('2074', 'Trach mask', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('2463', 'Mask, non-rebreathing', 'Oxygen Supplies', 'HUD1059', NULL, 'active', true, false, 'high', ARRAY['Non-rebreather']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114446.jpg', '20260715_114603.jpg', '20260715_114622.jpg']::text[]),
  ('2580', 'Capstrap XS', 'BiPAP / NIV', '86115', 'Tri-Anim', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg']::text[]),
  ('2661', 'Tubing O2 connecting with grip', 'Oxygen Supplies', 'CF1350', NULL, 'active', true, false, 'high', ARRAY['O2 tubing']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_113226.jpg', '20260715_114446.jpg', '20260715_114622.jpg']::text[]),
  ('2674', 'Filter, bacteria, disposable', 'Vent Supplies', '303EU', NULL, 'active', true, false, 'high', ARRAY['Bacterial filter']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_114550.jpg']::text[]),
  ('3125', 'Washington Hospital letterhead', 'Office Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105702.jpg']::text[]),
  ('3421', 'Respigard II nebulizer', 'Treatment Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('3526', 'Adult anesthesia mask', 'Vent Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('3543', 'Bags 12 x 15 set-up patient', 'Miscellaneous', '1314RSP4003', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg', '20260715_113239.jpg', '20260715_114550.jpg']::text[]),
  ('3714', 'Omni Flex', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('3719', '15 mm adapter', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('3819', 'Cannula, neonatal nasal, Salter', 'Premature & Infant', '77-1601EA', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114603.jpg']::text[]),
  ('3923', 'Vermed ECG electrodes', 'Pulmonary Rehab', NULL, 'Vermed', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105702.jpg']::text[]),
  ('4031', 'Peak flow meter', 'Treatment Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('4060', 'Adapter, universal ported, 22 mm x 22 mm', 'Oxygen Supplies', '70-002725', NULL, 'active', true, false, 'high', ARRAY['22 mm universal ported adapter']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114416.jpg']::text[]),
  ('4358', 'Trach Shiley inner cannula 6', 'Airway & Intubation', '6DIC', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg', '20260715_114446.jpg']::text[]),
  ('4600', 'Unit dose normal saline 15 mL', 'Treatment Supplies', '6135000116', NULL, 'active', true, false, 'high', ARRAY['Saline bullet']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_113226.jpg', '20260715_114510.jpg', '20260715_114612.jpg']::text[]),
  ('5376', 'Valve biopsy suction bronch', 'Bronchoscopy', 'MAJ-209', NULL, 'active', true, false, 'high', ARRAY['Single-use suction valve']::text[], NULL, ARRAY['20260715_105744.jpg', '20260715_114446.jpg', '20260715_114457.jpg']::text[]),
  ('5377', 'Valve biopsy bronch (MAJ-210)', 'Bronchoscopy', 'MAJ-210', NULL, 'active', true, false, 'high', ARRAY['Single-use biopsy valve']::text[], NULL, ARRAY['20260715_105744.jpg', '20260715_114446.jpg', '20260715_114457.jpg']::text[]),
  ('5382', 'Mallinckrodt Hi-Lo oral/nasal 7.5 mm trach tube, cuffed', 'Airway & Intubation', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('5549', 'Patient circuit', 'Vent Supplies', '758200-001', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114439.jpg', '20260715_114550.jpg']::text[]),
  ('5566', 'CO2 detector Pedi-Cap, infant', 'Pediatric', 'PEDICAP-6', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114426.jpg']::text[]),
  ('5585', 'Pediatric non-rebreather', 'Pediatric', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('5673', 'Normal saline 100 mL', 'Treatment Supplies', 'AL4109', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114439.jpg', '20260715_114510.jpg']::text[]),
  ('5916', 'Disposable bronch cytology brush', 'Bronchoscopy', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105744.jpg']::text[]),
  ('6042', 'Capstrap L/C', 'BiPAP / NIV', 'G07873', 'Tri-Anim', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg']::text[]),
  ('7267', 'ETADs', 'Vent Supplies', '87-VP700EA', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('7289', 'Reservoir Concha 1650 mL (no columns)', 'High Flow', 'HUD38150', NULL, 'active', true, false, 'high', ARRAY['Concha water']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_113226.jpg', '20260715_114502.jpg', '20260715_114622.jpg']::text[]),
  ('7291', 'Heated breathing circuits', 'Vent Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('7328', 'Nebulizer MiniHEART Hi-Flo LF', 'Treatment Supplies', '100612A', NULL, 'active', true, false, 'high', ARRAY['Continuous neb']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114510.jpg', '20260715_114622.jpg']::text[]),
  ('7889', 'Bite block', 'Transport Vent', '301-T101', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('7891', 'Mask NIV total-face large PerforMax single-use, EE leak 2 elbow', 'BiPAP / NIV', 'R1052532', NULL, 'active', true, false, 'high', ARRAY['Large full-face mask']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_113239.jpg', '20260715_114439.jpg', '20260715_114603.jpg']::text[]),
  ('8859', 'Vortran', 'Treatment Supplies', NULL, NULL, 'discontinued', false, false, 'high', ARRAY[]::text[], 'Reference sheet says discontinue use.', ARRAY['20260715_105651.jpg']::text[]),
  ('8867', 'Filter Line H set, adult/pediatric', 'Transport Vent', 'XS-04624', NULL, 'active', true, false, 'high', ARRAY['Inline vent tidal CO2']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_114510.jpg']::text[]),
  ('8965', '22 mm straight adapter', 'Oxygen Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('9700', 'Capstrap M/B', 'BiPAP / NIV', NULL, 'Tri-Anim', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg']::text[]),
  ('11015', 'Laryngeal mask airway, size 5', 'Airway & Intubation', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('11102', 'Infant cannula', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('11106', 'Pediatric simple mask', 'Pediatric', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('11210', 'Nose cushion, large', 'BiPAP / NIV', 'MLK6+0XLTIN', 'Tri-Anim', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg']::text[]),
  ('11211', 'Nose cushion, extra large', 'BiPAP / NIV', '70XLTIN', 'Tri-Anim', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg']::text[]),
  ('11212', 'Blue elbow capstrap', 'BiPAP / NIV', '680XLTIN', 'Tri-Anim', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg']::text[]),
  ('11419', 'Oxygenator', 'Oxygen Supplies', 'HUD1668', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114457.jpg']::text[]),
  ('12000', 'Protector, ear, E-Z Wrap', 'Oxygen Supplies', '1016SA', NULL, 'active', true, false, 'high', ARRAY['E-Z Wrap ear protector']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114450.jpg']::text[]),
  ('12693', 'Nose cushion, small', 'BiPAP / NIV', 'G05880', 'Tri-Anim', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg']::text[]),
  ('13730', 'Servo filter', 'Vent Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('13731', 'Breathing circuit, 22 mm', 'Vent Supplies', 'HUD1607', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_113226.jpg', '20260715_114446.jpg', '20260715_114617.jpg']::text[]),
  ('15313', 'Adapter swivel bronchoscope', 'Bronchoscopy', 'PTX625191', NULL, 'active', true, false, 'high', ARRAY['Bronch swivel adapter']::text[], NULL, ARRAY['20260715_105744.jpg', '20260715_114457.jpg']::text[]),
  ('16365', 'Nasal cannula adult with 7 ft (2.1 m) supply tube', 'Oxygen Supplies', '6135000556', NULL, 'active', true, false, 'high', ARRAY['Nasal cannula']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114432.jpg', '20260715_114502.jpg']::text[]),
  ('19647', 'Laryngeal mask airway, size 3', 'Airway & Intubation', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('19770', 'Laryngeal mask airway, size 4', 'Airway & Intubation', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('20283', 'Refillable helium cylinder, 3-pack', 'Oxygen Supplies', NULL, 'Maquet', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('20300', 'GlideScope Cobalt/Ranger laryngoscope, size 4', 'Airway & Intubation', '0270-0628', NULL, 'active', true, false, 'high', ARRAY['GlideScope GVL 4 Stat']::text[], NULL, ARRAY['20260715_105925.jpg', '20260715_114416.jpg', '20260715_114426.jpg', '20260715_114518.jpg']::text[]),
  ('20301', 'GlideScope Cobalt/Ranger laryngoscope, size 3', 'Airway & Intubation', '0270-0626', NULL, 'active', true, false, 'high', ARRAY['GlideScope GVL 3 Stat']::text[], NULL, ARRAY['20260715_105925.jpg', '20260715_113239.jpg', '20260715_114426.jpg', '20260715_114603.jpg']::text[]),
  ('20435', 'Robertazzi nasopharyngeal airway, 32 Fr', 'Airway & Intubation', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('21454', 'Capstrap S/A', 'BiPAP / NIV', '4DIC', 'Tri-Anim', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg']::text[]),
  ('21581', 'Mask NIV oronasal small AF541, capstrap headgear, EE leak 1 elbow', 'BiPAP / NIV', '73-1120915', NULL, 'active', true, false, 'high', ARRAY['Small capstrap']::text[], 'Older reference sheet groups PMM 21581/22540 under small capstrap.', ARRAY['20260715_105736.jpg', '20260715_113239.jpg', '20260715_114439.jpg']::text[]),
  ('21585', 'Pressure EZ', 'Transport Vent', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('21586', 'Corrugated Comfort Flo', 'High Flow', 'HUD2410', NULL, 'active', true, true, 'high', ARRAY['Hi Flo circuit']::text[], 'Older reference sheet says discontinue use, but later requisitions show active ordering.', ARRAY['20260715_105736.jpg', '20260715_113226.jpg', '20260715_114446.jpg', '20260715_114622.jpg']::text[]),
  ('21587', 'Comfort Flo cannula', 'High Flow', NULL, NULL, 'discontinued', false, false, 'high', ARRAY[]::text[], 'Reference sheet says discontinue use.', ARRAY['20260715_105736.jpg']::text[]),
  ('21588', 'Hi Flo nasal cannula, pediatric', 'Pediatric', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('21589', 'Comfort Flo infant', 'Premature & Infant', 'HUD241103', NULL, 'active', true, false, 'high', ARRAY['Hi Flo nasal cannula infant']::text[], NULL, ARRAY['20260715_105820.jpg', '20260715_114510.jpg']::text[]),
  ('21591', 'Acapella DH Green', 'Treatment Supplies', NULL, NULL, 'discontinued', false, false, 'high', ARRAY[]::text[], 'Reference sheet says discontinue use.', ARRAY['20260715_105651.jpg']::text[]),
  ('21592', 'Aeroneb Solo adult disposable', 'Treatment Supplies', '06-AG-AS3350-US', NULL, 'active', true, false, 'high', ARRAY['Aerogen neb']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_113239.jpg', '20260715_114408.jpg', '20260715_114622.jpg']::text[]),
  ('21744', 'Salter Labs nebulizer — replacement for PMM 68 and BAN 2', 'Treatment Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg']::text[]),
  ('21749', 'Circuit ventilator adult LTV-1200', 'Transport Vent', '29657-001', NULL, 'active', true, false, 'high', ARRAY['Adult LTV circuit']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_114446.jpg', '20260715_114603.jpg']::text[]),
  ('21751', 'Small full-face mask', 'BiPAP / NIV', NULL, NULL, 'do_not_use', false, false, 'high', ARRAY[]::text[], 'Reference sheet says do not use.', ARRAY['20260715_105736.jpg']::text[]),
  ('22401', '840 filter', 'Vent Supplies', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('22540', 'Mask nasal headgear capstrap medium AF543', 'BiPAP / NIV', '73-1120916', NULL, 'active', true, false, 'high', ARRAY['Small capstrap']::text[], 'Older reference sheet labels sizing differently than eProcurement.', ARRAY['20260715_105736.jpg', '20260715_113226.jpg', '20260715_113239.jpg', '20260715_114612.jpg']::text[]),
  ('22541', 'Mask nasal headgear capstrap large AF541', 'BiPAP / NIV', '73-1120917', NULL, 'active', true, true, 'high', ARRAY['Medium capstrap']::text[], 'Older reference sheet labels this medium capstrap; eProcurement consistently labels large.', ARRAY['20260715_105736.jpg', '20260715_113226.jpg', '20260715_114426.jpg', '20260715_114612.jpg']::text[]),
  ('22542', 'Mask NIV oronasal XL AF541, capstrap headgear, EE leak 1 elbow', 'BiPAP / NIV', '989805653881', NULL, 'active', true, true, 'high', ARRAY['Large capstrap']::text[], 'Older reference sheet labels this large capstrap; eProcurement consistently labels XL NIV mask.', ARRAY['20260715_105736.jpg', '20260715_113226.jpg', '20260715_113239.jpg', '20260715_114612.jpg']::text[]),
  ('23161', 'Clear equipment cover 28 x 22 x 56, 50/roll', 'Miscellaneous', '0083', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg', '20260715_114416.jpg', '20260715_114446.jpg']::text[]),
  ('23571', 'Forceps spiral basket', 'Bronchoscopy', NULL, 'Olympus', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105744.jpg']::text[]),
  ('23687', 'MIF', 'Transport Vent', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('23703', 'Dressing Mepilex 4 x 4', 'Wound / Skin Protection', 'MHC294199', 'Medline', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg', '20260715_114432.jpg', '20260715_114502.jpg']::text[]),
  ('23704', 'Dressing Mepilex 6 x 6', 'Wound / Skin Protection', 'MHC294399', 'Medline', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_110115.jpg', '20260715_114432.jpg', '20260715_114502.jpg']::text[]),
  ('24723', 'Solution water 500 mL', 'Bubble CPAP', 'BBR5001-01', NULL, 'active', true, false, 'high', ARRAY['Braun sterile water 500 mL']::text[], NULL, ARRAY['20260715_105744.jpg', '20260715_113239.jpg', '20260715_114510.jpg', '20260715_114612.jpg']::text[]),
  ('26810', 'GlideScope rigid stylets, pack of 10', 'Airway & Intubation', '0270-0681', NULL, 'active', true, false, 'high', ARRAY['GlideRite rigid stylet']::text[], NULL, ARRAY['20260715_105925.jpg', '20260715_114457.jpg']::text[]),
  ('27010', 'Elbow for BAN', 'Treatment Supplies', NULL, NULL, 'discontinued', false, false, 'high', ARRAY[]::text[], 'Reference sheet says discontinue use.', ARRAY['20260715_105651.jpg']::text[]),
  ('27214', 'Aerobika oscillating positive expiratory pressure (OPEP) therapy system', 'Treatment Supplies', '58-62510EA', NULL, 'active', true, false, 'high', ARRAY['Aerobika']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114426.jpg', '20260715_114603.jpg']::text[]),
  ('27499', 'GlideScope GVL 1 Stat', 'Airway & Intubation', '0270-0428', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg', '20260715_114426.jpg']::text[]),
  ('27602', 'XL full-face mask', 'BiPAP / NIV', '58-88810EA', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('27814', 'Disposable IPV circuit tubing, Phasitron and nebulizer', 'Treatment Supplies', 'P5-10', NULL, 'active', true, false, 'high', ARRAY['IPV redbox Phasitron kit']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114622.jpg']::text[]),
  ('27816', 'IPV inline valve', 'Treatment Supplies', 'PA P5-TEE-20', NULL, 'active', true, false, 'high', ARRAY['IPV vent cone blue']::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114518.jpg']::text[]),
  ('27918', 'Theraband/rep band 50-yard roll, level 2, teal', 'Pulmonary Rehab', NULL, 'North Coast Medical', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105702.jpg']::text[]),
  ('27920', 'Theraband/rep band 50-yard roll, level 3, light green', 'Pulmonary Rehab', NULL, 'North Coast Medical', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105702.jpg']::text[]),
  ('27948', 'Neonatal D-X 800 expiratory filter', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('28000', 'Nasal tubing universal, 70 mm x 5', 'Premature & Infant', 'BC191-05', NULL, 'active', true, false, 'high', ARRAY['Infant nasal tubing 70 mm']::text[], NULL, ARRAY['20260715_105820.jpg', '20260715_114502.jpg']::text[]),
  ('28002', 'Infant nasal mask, small', 'Premature & Infant', 'BC800-10', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg', '20260715_113744.jpg']::text[]),
  ('28003', 'Infant nasal mask, medium', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('28004', 'Infant nasal mask, large', 'Premature & Infant', 'BC802-10', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg', '20260715_113744.jpg']::text[]),
  ('28006', 'Infant nasal mask, extra large', 'Premature & Infant', 'BC803-10', NULL, 'active', true, false, 'high', ARRAY['Mask bubble CPAP X-large']::text[], NULL, ARRAY['20260715_105820.jpg', '20260715_113744.jpg']::text[]),
  ('28007', 'Infant bonnet, 17–22 cm', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('28008', 'Infant bonnet, 22–25 cm', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('28010', 'Infant bonnet, 25–29 cm', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('28011', 'Bonnet midline, 29–36 cm', 'Premature & Infant', 'BC309-05', NULL, 'active', true, false, 'high', ARRAY['Infant bonnet 29–36 cm']::text[], NULL, ARRAY['20260715_105820.jpg', '20260715_113239.jpg', '20260715_114416.jpg', '20260715_114446.jpg']::text[]),
  ('28030', 'AccuPAP', 'Treatment Supplies', '301-6001', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105651.jpg', '20260715_114510.jpg']::text[]),
  ('28036', 'Infant nasal tubing, 50 mm', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('28037', 'Infant nasal tubing, 100 mm', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('28262', 'Humidifier Comfort Flo, disposable, latex-free, sterile', 'High Flow', 'HUD2414', NULL, 'active', true, true, 'high', ARRAY['Hi Flo with extension']::text[], 'Older reference sheet says discontinue use, but a later requisition shows this PMM.', ARRAY['20260715_105736.jpg', '20260715_114432.jpg']::text[]),
  ('28529', 'Nellcor SpO2 sensors, adult', 'Pulmonary Rehab', NULL, 'Covidien/Medline', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105702.jpg']::text[]),
  ('28543', 'P. Neuton circuit', 'Transport Vent', NULL, 'Tri-Anim', 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105736.jpg']::text[]),
  ('28639', 'Premature Comfort Flo nasal cannula', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('31024', 'Guard Ancorfast', 'Vent Supplies', '9800', NULL, 'active', true, true, 'high', ARRAY['Red ETAD']::text[], 'Older reference sheet labels PMM 31024 as red ETAD and says do not use; later eProcurement repeatedly uses it for Guard Ancorfast.', ARRAY['20260715_105736.jpg', '20260715_113239.jpg', '20260715_114426.jpg', '20260715_114622.jpg']::text[]),
  ('31231', 'NC tubing O2 Capnoline H Plus, adult', 'Capnography', 'BC161-10', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('31232', 'Smart Capnoline H O2 pediatric disposable', 'Capnography', '010582', NULL, 'active', true, false, 'high', ARRAY['Pediatric Smart Capnoline O2 disposable']::text[], NULL, ARRAY['20260715_105820.jpg', '20260715_114531.jpg']::text[]),
  ('31234', 'NC/oral tubing O2 Guardian Smart Capnoline', 'Capnography', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('31235', 'Set FilterLine H, adult and pediatric, disposable', 'Capnography', 'MVAIH100U', NULL, 'active', true, false, 'high', ARRAY['Vent FilterLine H adult/pediatric disposable']::text[], NULL, ARRAY['20260715_105820.jpg', '20260715_113226.jpg', '20260715_114518.jpg', '20260715_114612.jpg']::text[]),
  ('31488', 'MRI LoFlo line, adult airway adapter', 'Capnography', '04-2D0735XEA', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105925.jpg']::text[]),
  ('32807', 'Premature nasal cannula', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('33084', 'Expiratory valve set', 'Hamilton G5', '950158/02', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105702.jpg', '20260715_113239.jpg', '20260715_114502.jpg', '20260715_114622.jpg']::text[]),
  ('33085', 'Airway adapter, adult/pediatric', 'Hamilton G5', '281719', NULL, 'active', true, false, 'high', ARRAY['CO2 airway adapter, 10 per']::text[], NULL, ARRAY['20260715_105702.jpg', '20260715_114502.jpg', '20260715_114518.jpg']::text[]),
  ('33086', 'Flow sensor, adult/pediatric', 'Hamilton G5', '281637/04', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105702.jpg', '20260715_113239.jpg', '20260715_114502.jpg', '20260715_114622.jpg']::text[]),
  ('33087', 'IntelliCuff cuff pressure tube with filter', 'Hamilton G5', '282016/03', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105702.jpg', '20260715_113239.jpg', '20260715_114502.jpg', '20260715_114622.jpg']::text[]),
  ('33090', 'Infant flow sensor', 'Hamilton G5', NULL, NULL, 'do_not_use', false, false, 'high', ARRAY[]::text[], 'Reference sheet says do not use.', ARRAY['20260715_105702.jpg']::text[]),
  ('34048', 'GlideScope GVL 2 Stat', 'Airway & Intubation', '0270-0429', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114426.jpg']::text[]),
  ('34249', 'Ambu pediatric SPUR II bag with toddler reservoir/pop-off valve, mask, manometer, PEEP valve and expiratory filter', 'Pediatric', '530613051', NULL, 'active', true, false, 'medium', ARRAY[]::text[], NULL, ARRAY['20260715_114550.jpg']::text[]),
  ('34963', 'Comfort Flo Plus cannula, size small', 'High Flow', 'HUD241213', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114416.jpg']::text[]),
  ('34964', 'Comfort Flo Plus cannula with chin strap, medium', 'High Flow', 'HUD241212', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_113226.jpg', '20260715_114426.jpg', '20260715_114612.jpg']::text[]),
  ('35045', 'Humidification chamber for IntelliPAP, replacement part', 'High Flow', '27-DV5C', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_113226.jpg', '20260715_113239.jpg', '20260715_114603.jpg']::text[]),
  ('35996', 'Curaplex valved tee adapter, 22 OD x 22 ID', 'Oxygen Supplies', '301-T101', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_113239.jpg', '20260715_114439.jpg', '20260715_114603.jpg']::text[]),
  ('35997', 'Bubble CPAP set-up', 'Bubble CPAP', 'BC161-10', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_113239.jpg']::text[]),
  ('35998', 'AeroChamber adult blue Z-Stat', 'Treatment Supplies', '58-79750', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_113226.jpg', '20260715_113733.jpg', '20260715_114612.jpg']::text[]),
  ('35999', 'AeroChamber Plus Flow, medium, yellow', 'Treatment Supplies', '58-78810EA', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_113239.jpg', '20260715_114432.jpg']::text[]),
  ('36001', 'AeroChamber Plus Flow, small, orange', 'Treatment Supplies', '58-88810EA', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114432.jpg']::text[]),
  ('36005', 'Sterile water bags, 1000 mL', 'Bubble CPAP', '2D0735X', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114432.jpg']::text[]),
  ('36065', 'HEPA filter true with sample port, 22 mm OD / 15 mm ID', 'Vent Supplies', '87-FH603026', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114446.jpg', '20260715_114502.jpg', '20260715_114622.jpg']::text[]),
  ('36069', 'Circuit NIV with main-flow filter and DEP with filter exhalation port', 'BiPAP / NIV', 'HUD1698F', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114524.jpg']::text[]),
  ('36178', 'Port exhalation with filter, RP-DEP disposable', 'Vent Supplies', '73-1065832', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114439.jpg', '20260715_114446.jpg', '20260715_114622.jpg']::text[]),
  ('36208', 'PEEP valve', 'Pediatric', '87-VP700EA', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114426.jpg']::text[]),
  ('36212', 'Oxymizer pendant cannula', 'Oxygen Supplies', '204-P-224EA', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114416.jpg']::text[]),
  ('36218', 'Infant headgear, 29–35 cm', 'Premature & Infant', 'BC325-05', NULL, 'active', true, false, 'high', ARRAY[]::text[], 'Older reference sheet listed infant headgear as nonstock; eProcurement uses this PMM.', ARRAY['20260715_113239.jpg', '20260715_113744.jpg']::text[]),
  ('36239', 'AeroChamber Plus Flow, large, blue', 'Treatment Supplies', '58-80810EA', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114550.jpg']::text[]),
  ('36901', 'Provent Plus 25 x 5/8 in, 1 mL ABG kit', 'Transport Vent', '4611P-1', NULL, 'active', true, true, 'high', ARRAY['ABG kit']::text[], 'Older reference sheet says do not use; later requisition shows this exact catalog item.', ARRAY['20260715_105736.jpg', '20260715_113733.jpg']::text[]),
  ('38467', 'Philips nasal alar SpO2 sensor by Curaplex, disposable', 'Monitoring', '301-11214', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114450.jpg', '20260715_114603.jpg']::text[]),
  ('39751', 'Circuit smooth bore with filter, 10/case', 'Vent Supplies', '003770', NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_114524.jpg']::text[]),
  ('64505', 'Circuit disposable nasal CPAP/BiPAP without masks', 'BiPAP / NIV', '441-5805000', NULL, 'active', true, false, 'high', ARRAY['BiPAP circuit']::text[], NULL, ARRAY['20260715_105736.jpg', '20260715_114502.jpg', '20260715_114518.jpg']::text[]),
  ('71243', 'Infant non-rebreather', 'Premature & Infant', NULL, NULL, 'active', true, false, 'high', ARRAY[]::text[], NULL, ARRAY['20260715_105820.jpg']::text[]),
  ('72814', 'T-piece blue', 'Oxygen Supplies', NULL, NULL, 'discontinued', false, false, 'high', ARRAY[]::text[], 'Reference sheet says discontinue use.', ARRAY['20260715_105651.jpg']::text[])
on conflict (pmm_number) do update set
  item_name = excluded.item_name,
  category = excluded.category,
  vendor_catalog_number = excluded.vendor_catalog_number,
  vendor = excluded.vendor,
  catalog_status = excluded.catalog_status,
  is_orderable = excluded.is_orderable,
  review_required = excluded.review_required,
  confidence = excluded.confidence,
  alternate_descriptions = excluded.alternate_descriptions,
  notes = excluded.notes,
  source_files = excluded.source_files,
  updated_at = now();
