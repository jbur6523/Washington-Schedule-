alter table public.rental_records
  add column if not exists current_location text;

alter table public.rental_records
  drop constraint if exists rental_records_current_location_length;

alter table public.rental_records
  add constraint rental_records_current_location_length
  check (current_location is null or char_length(current_location) <= 80);

update public.rental_vendors
set notes = 'formerly Freedom / always use first',
    updated_at = now()
where name = 'US Med Equipment';

update public.rental_vendors
set notes = 'use only as last resort',
    updated_at = now()
where name = 'SRC';
