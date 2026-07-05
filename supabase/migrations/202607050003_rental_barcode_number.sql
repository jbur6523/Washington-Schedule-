alter table public.rental_equipment
  add column if not exists barcode_number text;

alter table public.rental_equipment
  alter column serial_number drop not null;

alter table public.rental_equipment
  drop constraint if exists rental_equipment_serial_length;

alter table public.rental_equipment
  add constraint rental_equipment_serial_length
  check (serial_number is null or char_length(serial_number) between 1 and 120);

alter table public.rental_equipment
  drop constraint if exists rental_equipment_barcode_length;

alter table public.rental_equipment
  add constraint rental_equipment_barcode_length
  check (barcode_number is null or char_length(barcode_number) between 1 and 120);

alter table public.rental_equipment
  drop constraint if exists rental_equipment_department_barcode_unique;

alter table public.rental_equipment
  add constraint rental_equipment_department_barcode_unique
  unique (department_id, barcode_number);

alter table public.rental_records
  add column if not exists barcode_number text;

alter table public.rental_records
  drop constraint if exists rental_records_barcode_length;

alter table public.rental_records
  add constraint rental_records_barcode_length
  check (barcode_number is null or char_length(barcode_number) between 1 and 120);

create index if not exists rental_records_department_barcode_idx
  on public.rental_records(department_id, barcode_number);

create index if not exists rental_equipment_department_barcode_idx
  on public.rental_equipment(department_id, barcode_number);
