-- Explicit, server-only trial permission. Existing identity-admin authority stays intact.
alter table public.etime_trial_grants add column temporary_manager_access boolean not null default false
  check (not temporary_manager_access or role = 'identity_admin');

-- Ending the trial permanently revokes temporary access, even if the trial is reopened.
create function public.etime_trial_revoke_temporary_access()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if not new.enabled then
    update public.etime_trial_grants set temporary_manager_access=false
    where temporary_manager_access;
  end if;
  return new;
end $$;
revoke all on function public.etime_trial_revoke_temporary_access() from public, anon, authenticated;
grant execute on function public.etime_trial_revoke_temporary_access() to service_role;
create trigger etime_trial_end_temporary_access after update of enabled on public.etime_trial_config
for each row execute function public.etime_trial_revoke_temporary_access();

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
 if p_action = 'managerSign' and not p_employee then
   update public.etime_trial_grants g
   set saved_signature_name = p_state->'managerSignature'->>'name'
   where 'reviewer:' || g.id::text = p_actor
     and g.department_id = i.department_id and g.active
     and (g.role = 'manager' or (g.role = 'identity_admin' and g.temporary_manager_access
       and exists(select 1 from public.etime_trial_config c where c.enabled and c.department_id=g.department_id)))
     and p_state->'managerSignature'->>'actor' = p_actor;
   if not found then raise exception 'Manager grant is unavailable.'; end if;
 end if;
 return f;
end $$;
