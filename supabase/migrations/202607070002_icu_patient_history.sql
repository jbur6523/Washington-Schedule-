alter table public.icu_patients
  add column if not exists ventilator_outcome text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'icu_patients_ventilator_outcome_check'
      and conrelid = 'public.icu_patients'::regclass
  ) then
    alter table public.icu_patients
      add constraint icu_patients_ventilator_outcome_check
      check (
        ventilator_outcome is null
        or ventilator_outcome in (
          'extubation',
          'trached_aerosol',
          'unplanned',
          'expired_on_ventilator',
          'transferred_to_another_facility',
          'donor_network',
          'discontinue_vent_support_palliative'
        )
      );
  end if;
end;
$$;

create table if not exists public.icu_patient_events (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  icu_patient_id uuid not null references public.icu_patients(id) on delete cascade,
  event_type text not null,
  event_summary text,
  event_data jsonb,
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  constraint icu_patient_events_type_check check (
    event_type in ('added', 'updated', 'critical_status_updated', 'discontinued')
  )
);

create index if not exists icu_patient_events_patient_created_idx
  on public.icu_patient_events(icu_patient_id, created_at desc);

create index if not exists icu_patient_events_department_created_idx
  on public.icu_patient_events(department_id, created_at desc);

create index if not exists icu_patient_events_type_idx
  on public.icu_patient_events(event_type);

alter table public.icu_patient_events enable row level security;

drop policy if exists "Authorized users can read ICU patient events" on public.icu_patient_events;
create policy "Authorized users can read ICU patient events"
  on public.icu_patient_events
  for select
  to authenticated
  using (public.user_can_view_icu_patients(department_id));

drop policy if exists "Authorized users can create ICU patient events" on public.icu_patient_events;
create policy "Authorized users can create ICU patient events"
  on public.icu_patient_events
  for insert
  to authenticated
  with check (public.user_can_manage_icu_patients(department_id));
