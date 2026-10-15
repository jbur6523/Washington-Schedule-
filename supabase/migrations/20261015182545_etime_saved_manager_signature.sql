-- Saved signature belongs to the reviewer account, across devices and pay periods.
-- Existing server-only privileges and RLS on grants remain unchanged.
alter table public.etime_trial_grants
  add column saved_signature_name text
  check (saved_signature_name is null or length(btrim(saved_signature_name)) between 1 and 100);

-- Persist the signature name atomically with its signed form and audit revision.
create or replace function public.etime_trial_save(p_identity uuid,p_period date,p_expected integer,p_state jsonb,p_actor text,p_action text,p_employee boolean)
returns public.etime_trial_forms language plpgsql security invoker set search_path='' as $$
declare f public.etime_trial_forms; i public.etime_trial_identities; today date := (now() at time zone 'America/Los_Angeles')::date; begin
 select * into strict i from public.etime_trial_identities where id=p_identity for update;
 if p_state->'identity' <> jsonb_build_object('employee_id',i.employee_id,'first_name',i.first_name,'last_name',i.last_name) then raise exception 'This form changed. Refresh and try again.'; end if;
 if p_employee and (today < p_period or today > p_period+16) then raise exception 'This pay period is closed.'; end if;
 insert into public.etime_trial_forms(identity_id,department_id,period_start,state)
 values(i.id,i.department_id,p_period,p_state) on conflict(identity_id,period_start) do nothing;
 select * into strict f from public.etime_trial_forms where identity_id=i.id and period_start=p_period for update;
 if f.revision <> p_expected then raise exception 'This form changed. Refresh and try again.'; end if;
 update public.etime_trial_forms set state=p_state,revision=revision+1,updated_at=now() where id=f.id returning * into f;
 insert into public.etime_trial_revisions(form_id,revision,state,action,actor) values(f.id,f.revision,f.state,p_action,p_actor);
 -- Remember only the name; each form still requires explicit adoption in the API.
 if p_action = 'managerSign' and not p_employee then
   update public.etime_trial_grants
   set saved_signature_name = p_state->'managerSignature'->>'name'
   where 'reviewer:' || id::text = p_actor
     and department_id = i.department_id and role = 'manager' and active
     and p_state->'managerSignature'->>'actor' = p_actor;
   if not found then raise exception 'Manager grant is unavailable.'; end if;
 end if;
 return f;
end $$;
