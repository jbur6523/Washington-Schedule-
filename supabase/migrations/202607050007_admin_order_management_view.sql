drop policy if exists "Aides can read department orders" on public.department_orders;
drop policy if exists "Aides and admins can read department orders" on public.department_orders;
create policy "Aides and admins can read department orders"
  on public.department_orders
  for select
  to authenticated
  using (
    public.user_is_department_aide(department_id)
    or public.user_is_department_admin(department_id)
  );

drop policy if exists "Aides can read department order images" on storage.objects;
drop policy if exists "Aides and admins can read department order images" on storage.objects;
create policy "Aides and admins can read department order images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'department-order-images'
    and (
      public.user_is_department_aide(public.department_order_storage_department_id(name))
      or public.user_is_department_admin(public.department_order_storage_department_id(name))
    )
  );
