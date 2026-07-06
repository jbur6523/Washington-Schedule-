drop policy if exists "Aides can create department orders" on public.department_orders;
drop policy if exists "Aides and admins can create department orders" on public.department_orders;
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
  );

drop policy if exists "Aides can upload department order images" on storage.objects;
drop policy if exists "Aides and admins can upload department order images" on storage.objects;
create policy "Aides and admins can upload department order images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'department-order-images'
    and (
      public.user_is_department_aide(public.department_order_storage_department_id(name))
      or public.user_is_department_admin(public.department_order_storage_department_id(name))
    )
  );
