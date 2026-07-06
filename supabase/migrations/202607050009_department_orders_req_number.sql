alter table public.department_orders
  add column if not exists req_number text null;

alter table public.department_orders
  drop constraint if exists department_orders_req_number_length;

alter table public.department_orders
  add constraint department_orders_req_number_length
  check (req_number is null or char_length(req_number) <= 80);

alter table public.department_orders
  drop constraint if exists department_orders_image_or_note;

alter table public.department_orders
  add constraint department_orders_image_or_note
  check (
    nullif(btrim(coalesce(image_storage_path, image_url, '')), '') is not null
    or nullif(btrim(coalesce(notes, '')), '') is not null
    or nullif(btrim(coalesce(req_number, '')), '') is not null
  );
