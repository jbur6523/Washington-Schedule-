
-- Store only modality settings; patient identity, notes, flags and lifecycle stay independent.
create or replace function public.icu_modality_profile(device text, source jsonb)
returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$
select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(source)
where key=any(case device
 when 'vent' then array['vent_mode','airway_type','airway_size','airway_at','airway_location','trach_type','trach_xlt','rate','tidal_volume','peep','fio2','ps','t_high','t_low','p_high','p_low','percent_min_vol']
 when 'bipap' then array['ipap','epap','rate','fio2']
 when 'cpap' then array['cpap','fio2']
 when 'hfnc' then array['flow','fio2']
 when 'cool_aerosol' then array['flow','fio2'] else array[]::text[] end);
$$;
revoke all on function public.icu_modality_profile(text,jsonb) from public, anon;
grant execute on function public.icu_modality_profile(text,jsonb) to authenticated;

