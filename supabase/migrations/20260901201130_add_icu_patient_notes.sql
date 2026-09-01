alter table public.icu_patients
  add column if not exists notes text;
