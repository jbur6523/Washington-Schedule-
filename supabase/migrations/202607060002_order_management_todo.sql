create table if not exists public.order_management_todo (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  content text not null default '',
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  updated_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_management_todo_one_per_department unique (department_id),
  constraint order_management_todo_content_length check (char_length(content) <= 5000)
);

create index if not exists order_management_todo_department_updated_idx
  on public.order_management_todo(department_id, updated_at desc);

drop trigger if exists order_management_todo_set_updated_at on public.order_management_todo;
create trigger order_management_todo_set_updated_at
  before update on public.order_management_todo
  for each row execute function public.set_updated_at();

alter table public.order_management_todo enable row level security;

drop policy if exists "Aides and admins can read order todo" on public.order_management_todo;
create policy "Aides and admins can read order todo"
  on public.order_management_todo
  for select
  to authenticated
  using (
    public.user_is_department_aide(department_id)
    or public.user_is_department_admin(department_id)
  );

drop policy if exists "Aides and admins can create order todo" on public.order_management_todo;
create policy "Aides and admins can create order todo"
  on public.order_management_todo
  for insert
  to authenticated
  with check (
    (
      public.user_is_department_aide(department_id)
      or public.user_is_department_admin(department_id)
    )
    and updated_by_staff_profile_id = public.current_staff_profile_id(department_id)
  );

drop policy if exists "Aides and admins can update order todo" on public.order_management_todo;
create policy "Aides and admins can update order todo"
  on public.order_management_todo
  for update
  to authenticated
  using (
    public.user_is_department_aide(department_id)
    or public.user_is_department_admin(department_id)
  )
  with check (
    (
      public.user_is_department_aide(department_id)
      or public.user_is_department_admin(department_id)
    )
    and updated_by_staff_profile_id = public.current_staff_profile_id(department_id)
  );

grant select, insert, update on public.order_management_todo to authenticated;
