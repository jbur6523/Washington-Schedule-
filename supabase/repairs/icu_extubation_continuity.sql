-- Run in a transaction as database administrator, after confirming the same episode.
-- Set repair.original_id, repair.replacement_id and both *_version settings first.
-- Never infer episode continuity from a room number alone. No records/events are deleted.
do $$
declare original public.icu_patients%rowtype; replacement public.icu_patients%rowtype; saved public.icu_patients%rowtype;
 snapshot jsonb;
begin
 select * into strict original from public.icu_patients where id=current_setting('repair.original_id')::uuid for update;
 select * into strict replacement from public.icu_patients where id=current_setting('repair.replacement_id')::uuid for update;
 if original.updated_at is distinct from current_setting('repair.original_version')::timestamptz
 or replacement.updated_at is distinct from current_setting('repair.replacement_version')::timestamptz
 or original.id=replacement.id or original.department_id<>replacement.department_id or original.bed<>replacement.bed
 or original.is_active or original.device_type<>'vent' or original.ventilator_outcome is distinct from 'extubation'
 or not replacement.is_active or replacement.device_type in ('vent','none')
 or replacement.created_at < original.updated_at or replacement.created_at > original.updated_at + interval '10 minutes' then
  raise exception 'Episode verification failed or records changed; repair canceled.';
 end if;
 snapshot:=original.rounding_data || replacement.rounding_data || jsonb_build_object('extubation',jsonb_build_object(
  'at',original.discontinued_at,'modality',replacement.device_type,'settings',public.icu_modality_profile(replacement.device_type,to_jsonb(replacement))));
 snapshot:=jsonb_set(snapshot,'{modalities}',(coalesce(original.rounding_data->'modalities','{}'::jsonb)||coalesce(replacement.rounding_data->'modalities','{}'::jsonb))-'vent');
 update public.icu_patients set is_active=false,rounding_data=rounding_data||jsonb_build_object('continuityMergedInto',original.id)
 where id=replacement.id;
 update public.icu_patients set is_active=true,discontinued_at=null,discontinued_by_staff_profile_id=null,
 device_type=replacement.device_type,airway_type=null,airway_size=null,airway_at=null,airway_location=null,trach_type=null,trach_xlt=false,
 vent_mode=null,rate=replacement.rate,tidal_volume=null,pressure_control=null,peep=null,ps=null,t_high=null,t_low=null,p_high=null,p_low=null,percent_min_vol=null,
 ipap=replacement.ipap,epap=replacement.epap,cpap=replacement.cpap,flow=replacement.flow,fio2=replacement.fio2,
 notes=coalesce(replacement.notes,original.notes),is_standby=replacement.is_standby,is_sbt=false,is_critical_vent=false,is_flolan=false,is_prone=false,
 rounding_data=snapshot,updated_by_staff_profile_id=replacement.updated_by_staff_profile_id
 where id=original.id returning * into saved;
 -- Preserve the original audit payloads while correcting the episode classification.
 update public.icu_patient_events e set icu_patient_id=original.id,
 event_type=case when e.event_type='added' then 'updated' else e.event_type end,
 event_summary=case when e.event_type='added' then 'Post-extubation modality settings saved.' else e.event_summary end,
 event_data=coalesce(e.event_data,'{}'::jsonb)||jsonb_build_object('action',case when e.event_type='added' then 'modality_switched' else e.event_data->>'action' end,'continuityOriginalPatientId',replacement.id,'continuityOriginalEvent',to_jsonb(e))
 where e.icu_patient_id=replacement.id;
 update public.icu_patient_events e set event_type='updated',event_summary='Extubated. Patient care continues.',
 event_data=coalesce(e.event_data,'{}'::jsonb)||jsonb_build_object('action','extubated','record',to_jsonb(saved),'continuityOriginalEvent',to_jsonb(e))
 where e.icu_patient_id=original.id and e.event_type='discontinued' and e.event_data->>'ventilatorOutcomeValue'='extubation';
 insert into public.icu_patient_events(department_id,icu_patient_id,event_type,event_time,event_summary,event_data,created_by_name)
 values(original.department_id,original.id,'updated',clock_timestamp(),'Corrected extubation episode continuity; current settings preserved.',
 jsonb_build_object('action','extubation_continuity_repaired','bed',saved.bed,'record',to_jsonb(saved),'originalRecordBeforeRepair',to_jsonb(original),'replacementRecordBeforeRepair',to_jsonb(replacement)),
 'System: continuity repair');
end;
$$;
