create extension if not exists pg_trgm;

create index if not exists department_orders_created_at_idx
  on public.department_orders(created_at desc);

create index if not exists department_orders_req_number_idx
  on public.department_orders
  using gin (req_number gin_trgm_ops)
  where req_number is not null;
