alter table public.icu_patients
  add column if not exists discontinued_at timestamptz,
  add column if not exists discontinued_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null;

alter table public.icu_patient_events
  add column if not exists event_time timestamptz not null default now();

create index if not exists icu_patient_events_event_time_idx
  on public.icu_patient_events(event_time desc);

create index if not exists icu_patient_events_type_time_idx
  on public.icu_patient_events(event_type, event_time desc);

create index if not exists icu_patient_events_patient_time_idx
  on public.icu_patient_events(icu_patient_id, event_time desc);
