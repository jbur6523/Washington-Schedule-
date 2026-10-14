-- Allow optional pickup call and collection in one atomic popup update.
create or replace function public.update_rental_list(
  target_department_id uuid, action text, payload jsonb,
  target_record_id uuid default null, expected_updated_at timestamptz default null,
  request_id uuid default null
) returns setof public.rental_records
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  old_record public.rental_records%rowtype;
  item public.rental_records%rowtype;
  person jsonb; people jsonb; stage text; event_kind public.rental_event_type;
  event_time timestamptz; quantity integer; item_index integer; company uuid;
  serial text; barcode text; equipment uuid; caller uuid;
begin
  if auth.uid() is null or not public.user_can_manage_rentals(target_department_id) then
    raise exception 'RENTAL_ACCESS_DENIED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rental-list:'||target_department_id::text,0));
  caller := public.current_staff_profile_id(target_department_id);
  if action='order' then
    if request_id is null then raise exception 'Order request ID is required.'; end if;
    if exists(select 1 from public.rental_records where department_id=target_department_id and order_request_id=request_id) then
      return query select * from public.rental_records where department_id=target_department_id and order_request_id=request_id order by order_item;
      return;
    end if;
    quantity := (payload->>'quantity')::integer;
    if quantity is null or quantity<1 or quantity>20 then raise exception 'Quantity must be between 1 and 20.'; end if;
    company := (payload->>'vendor_id')::uuid;
    if not exists(select 1 from public.rental_vendors where id=company and department_id=target_department_id and is_active) then raise exception 'INVALID_RENTAL_VENDOR'; end if;
    person := public.rental_event_person(target_department_id,payload->'person');
    event_time := (payload->>'at')::timestamptz;
    if event_time is null or not isfinite(event_time) then raise exception 'Enter a valid date and time.'; end if;
    for item_index in 1..quantity loop
      insert into public.rental_records(department_id,vendor_id,equipment_type,status,called_in_at,called_in_by_staff_profile_id,called_in_by_name,attribution,order_request_id,order_item)
      values(target_department_id,company,'bipap','pending_delivery',event_time,(person->>'staff_profile_id')::uuid,person->>'name',jsonb_build_object('order',person),request_id,item_index)
      returning * into item;
      insert into public.rental_events(department_id,rental_record_id,event_type,event_at,actor_staff_profile_id,event_data)
      values(target_department_id,item.id,'called_in',event_time,caller,jsonb_build_object('person',person,'order_quantity',quantity,'order_item',item_index,'after',to_jsonb(item)));
      return next item;
    end loop;
    return;
  end if;
  select * into old_record from public.rental_records where id=target_record_id and department_id=target_department_id for update;
  if old_record.id is null then raise exception 'RENTAL_NOT_FOUND'; end if;
  if expected_updated_at is null or old_record.updated_at<>expected_updated_at then raise exception 'STALE_RENTAL_STATE' using errcode='40001'; end if;
  item := old_record;
  if action='return_update' then
    if not (payload->'stages' ? 'pickup' or payload->'stages' ? 'returned') or payload->'stages' is null then
      raise exception 'Record a pickup call or company collection.';
    end if;
    if payload->'stages' ? 'pickup' then
      select * into item from public.update_rental_list(target_department_id,'pickup',payload->'stages'->'pickup',item.id,item.updated_at);
    end if;
    if payload->'stages' ? 'returned' then
      select * into item from public.update_rental_list(target_department_id,'returned',payload->'stages'->'returned',item.id,item.updated_at);
    end if;
    return next item;
    return;
  end if;
  if action='edit' then
    item.vendor_id := (payload->>'vendor_id')::uuid;
    if item.vendor_id is distinct from old_record.vendor_id and not exists(select 1 from public.rental_vendors where id=item.vendor_id and department_id=target_department_id and is_active) then raise exception 'INVALID_RENTAL_VENDOR'; end if;
    if item.vendor_id is null then raise exception 'INVALID_RENTAL_VENDOR'; end if;
    item.serial_number := nullif(btrim(payload->>'serial_number'),'');
    item.barcode_number := nullif(btrim(payload->>'barcode_number'),'');
    people := old_record.attribution;
    foreach stage in array array['order','delivery','pickup','returned'] loop
      if payload->'stages' ? stage then
        -- Corrections cannot invent or remove lifecycle stages.
        event_time := case stage when 'order' then old_record.called_in_at when 'delivery' then old_record.checked_in_at when 'pickup' then old_record.pickup_requested_at else old_record.returned_at end;
        if event_time is null then raise exception 'Cannot edit a stage that has not happened.'; end if;
        person := public.rental_event_person(target_department_id,payload->'stages'->stage->'person');
        event_time := (payload->'stages'->stage->>'at')::timestamptz;
        if event_time is null or not isfinite(event_time) then raise exception 'Enter a valid date and time.'; end if;
        people := people || jsonb_build_object(stage,person);
        case stage
          when 'order' then item.called_in_at:=event_time; item.called_in_by_staff_profile_id:=(person->>'staff_profile_id')::uuid; item.called_in_by_name:=person->>'name';
          when 'delivery' then item.checked_in_at:=event_time; item.checked_in_by_staff_profile_id:=(person->>'staff_profile_id')::uuid;
          when 'pickup' then item.pickup_requested_at:=event_time; item.pickup_requested_by_staff_profile_id:=(person->>'staff_profile_id')::uuid;
          when 'returned' then item.returned_at:=event_time; item.returned_by_staff_profile_id:=(person->>'staff_profile_id')::uuid;
        end case;
      end if;
    end loop;
    item.attribution := people;
    event_kind := 'edited'; event_time := clock_timestamp();
  else
    person := public.rental_event_person(target_department_id,payload->'person');
    event_time := (payload->>'at')::timestamptz;
    if event_time is null or not isfinite(event_time) then raise exception 'Enter a valid date and time.'; end if;
    if action='delivery' and item.status in ('pending_delivery','called_in') then
      item.serial_number:=nullif(btrim(payload->>'serial_number'),'');
      if item.serial_number is null then raise exception 'Serial Number is required.'; end if;
      item.barcode_number:=nullif(btrim(payload->>'barcode_number'),'');
      item.status:='active'; item.checked_in_at:=event_time;
      item.checked_in_by_staff_profile_id:=(person->>'staff_profile_id')::uuid;
      item.current_location:=coalesce(item.current_location,'RT Equipment Room');
      event_kind:='delivered';
    elsif action='pickup' and item.status in ('active','delivered') then
      item.status:='pickup_called'; item.pickup_requested_at:=event_time;
      item.pickup_requested_by_staff_profile_id:=(person->>'staff_profile_id')::uuid;
      event_kind:='pickup_called';
    elsif action='returned' and item.status in ('active','delivered','pickup_requested','pickup_called','called_for_pickup') then
      item.status:='picked_up'; item.returned_at:=event_time;
      item.returned_by_staff_profile_id:=(person->>'staff_profile_id')::uuid;
      event_kind:='picked_up';
    elsif action='cancel_delivery' and item.status in ('pending_delivery','called_in') then
      item.status:='delivery_cancelled'; item.cancelled_at:=event_time;
      item.cancelled_by_staff_profile_id:=(person->>'staff_profile_id')::uuid;
      event_kind:='delivery_cancelled';
    elsif action='cancel_pickup' and item.status in ('pickup_requested','pickup_called','called_for_pickup') then
      item.status:='active'; item.pickup_requested_at:=null; item.pickup_requested_by_staff_profile_id:=null;
      item.attribution:=item.attribution-'pickup'; event_kind:='pickup_cancelled';
    else raise exception 'STALE_RENTAL_STATE' using errcode='40001';
    end if;
    item.attribution:=item.attribution||jsonb_build_object(action,person);
  end if;
  if item.checked_in_at is not null and item.called_in_at is not null and item.checked_in_at<item.called_in_at
    or item.pickup_requested_at is not null and item.checked_in_at is not null and item.pickup_requested_at<item.checked_in_at
    or item.returned_at is not null and coalesce(item.pickup_requested_at,item.checked_in_at) is not null and item.returned_at<coalesce(item.pickup_requested_at,item.checked_in_at)
  then raise exception 'Dates must follow the rental lifecycle order.'; end if;
  serial:=item.serial_number; barcode:=item.barcode_number;
  if action='edit' and old_record.serial_number is not null and serial is null then raise exception 'Serial Number is required.'; end if;
  if item.status in ('active','delivered','pickup_requested','pickup_called','called_for_pickup') and exists(
    select 1 from public.rental_records r where r.department_id=target_department_id and r.id<>item.id
    and r.status in ('active','delivered','pickup_requested','pickup_called','called_for_pickup')
    and (lower(r.serial_number) in (lower(serial),lower(barcode)) or lower(r.barcode_number) in (lower(serial),lower(barcode)))
  ) then raise exception 'DUPLICATE_ACTIVE_RENTAL'; end if;
  if action='delivery' then
    select id into equipment from public.rental_equipment where department_id=target_department_id
      and (lower(serial_number)=lower(serial) or (barcode is not null and lower(barcode_number)=lower(barcode))) order by updated_at desc limit 1;
    if equipment is null then
      insert into public.rental_equipment(department_id,vendor_id,equipment_type,serial_number,barcode_number,last_known_company)
      values(target_department_id,item.vendor_id,item.equipment_type,serial,barcode,(select name from public.rental_vendors where id=item.vendor_id)) returning id into equipment;
    else
      update public.rental_equipment set vendor_id=item.vendor_id,serial_number=serial,barcode_number=barcode,is_active=true,
        last_known_company=(select name from public.rental_vendors where id=item.vendor_id) where id=equipment;
    end if;
    item.equipment_id:=equipment;
  end if;
  -- Correct the equipment directory only when this is its newest rental;
  -- editing an older rental must not overwrite a later rental's equipment.
  if action='edit' and item.equipment_id is not null and not exists(
    select 1 from public.rental_records r where r.equipment_id=item.equipment_id and r.created_at>item.created_at
  ) then
    update public.rental_equipment set vendor_id=item.vendor_id,serial_number=serial,barcode_number=barcode,
      last_known_company=(select name from public.rental_vendors where id=item.vendor_id) where id=item.equipment_id;
  end if;
  update public.rental_records set vendor_id=item.vendor_id,equipment_id=item.equipment_id,serial_number=item.serial_number,barcode_number=item.barcode_number,
    status=item.status,called_in_at=item.called_in_at,called_in_by_staff_profile_id=item.called_in_by_staff_profile_id,called_in_by_name=item.called_in_by_name,
    checked_in_at=item.checked_in_at,checked_in_by_staff_profile_id=item.checked_in_by_staff_profile_id,current_location=item.current_location,
    pickup_requested_at=item.pickup_requested_at,pickup_requested_by_staff_profile_id=item.pickup_requested_by_staff_profile_id,
    returned_at=item.returned_at,returned_by_staff_profile_id=item.returned_by_staff_profile_id,
    cancelled_at=item.cancelled_at,cancelled_by_staff_profile_id=item.cancelled_by_staff_profile_id,attribution=item.attribution
    where id=item.id returning * into item;
  insert into public.rental_events(department_id,rental_record_id,equipment_id,event_type,event_at,actor_staff_profile_id,event_data)
  values(target_department_id,item.id,item.equipment_id,event_kind,event_time,caller,
    jsonb_build_object('person',person,'before',to_jsonb(old_record),'after',to_jsonb(item)));
  if action='delivery' and payload->>'scanned'='true' then
    insert into public.rental_events(department_id,rental_record_id,equipment_id,event_type,event_at,actor_staff_profile_id,event_data)
    values(target_department_id,item.id,item.equipment_id,'barcode_scanned',event_time,caller,jsonb_build_object('barcode_number',barcode,'person',person));
  end if;
  return next item;
end $$;
revoke all on function public.update_rental_list(uuid,text,jsonb,uuid,timestamptz,uuid) from public, anon;
grant execute on function public.update_rental_list(uuid,text,jsonb,uuid,timestamptz,uuid) to authenticated;
