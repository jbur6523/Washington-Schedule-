-- Apply before publishing the UI. Optional outcome comments use the existing
-- atomic lifecycle event_data field (ventilatorOutcomeComment), preserving notes.
alter table public.icu_patients
  drop constraint icu_patients_ventilator_outcome_check,
  add constraint icu_patients_ventilator_outcome_check check (
    ventilator_outcome is null or ventilator_outcome in (
      'extubation',
      'trached_aerosol',
      'unplanned',
      'expired_on_ventilator',
      'transferred_to_another_facility',
      'donor_network',
      'discontinue_vent_support_palliative',
      'other_unknown'
    )
  );
