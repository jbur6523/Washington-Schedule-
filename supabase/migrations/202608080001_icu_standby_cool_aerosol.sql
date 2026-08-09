alter table public.icu_patients
  add column if not exists is_standby boolean not null default false;

alter table public.icu_patients
  drop constraint if exists icu_patients_device_type_check;

alter table public.icu_patients
  add constraint icu_patients_device_type_check
  check (device_type in ('vent', 'bipap', 'cpap', 'hfnc', 'cool_aerosol'));

alter table public.icu_patient_events
  drop constraint if exists icu_patient_events_type_check;

alter table public.icu_patient_events
  add constraint icu_patient_events_type_check
  check (event_type in ('added', 'updated', 'critical_status_updated', 'standby_status_updated', 'discontinued'));
