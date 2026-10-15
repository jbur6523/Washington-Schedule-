-- Trial-only namespace. Official retention is deliberately not implemented here.
-- All access is through authorized server routes; no browser/Data API grants.
create table public.etime_trial_config (
 id boolean primary key default true check(id), department_id uuid not null references public.departments(id), enabled boolean not null default true
);
create table public.etime_trial_grants (
 id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 username text not null unique, display_name text not null, initials text not null check(length(initials) between 1 and 6),
 role text not null check(role in ('manager','timekeeper','identity_admin')), portal_only boolean not null default false,
 active boolean not null default true, claimed_at timestamptz
);
create table public.etime_trial_identities (
 id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id),
 employee_id text not null check(employee_id ~ '^[0-9]{1,20}$'), first_name text not null, last_name text not null,
 auth_user_id uuid unique references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), unique(department_id,employee_id)
);
create table public.etime_trial_sessions (
 token_hash text primary key, identity_id uuid not null references public.etime_trial_identities(id), expires_at timestamptz not null
);
create index on public.etime_trial_sessions(identity_id);
create table public.etime_trial_forms (
 id uuid primary key default gen_random_uuid(), identity_id uuid not null references public.etime_trial_identities(id),
 department_id uuid not null references public.departments(id), period_start date not null,
 revision integer not null default 0, state jsonb not null, updated_at timestamptz not null default now(),
 unique(identity_id,period_start), check ((period_start - date '2026-10-11') % 14 = 0)
);
create index on public.etime_trial_forms(department_id,period_start);
create table public.etime_trial_revisions (
 id uuid primary key default gen_random_uuid(), form_id uuid not null references public.etime_trial_forms(id),
 revision integer not null, state jsonb not null, action text not null, actor text not null, at timestamptz not null default now(), unique(form_id,revision)
);
create table public.etime_trial_identity_audit (
 id uuid primary key default gen_random_uuid(), identity_id uuid not null references public.etime_trial_identities(id),
 before_value jsonb, after_value jsonb not null, actor text not null, reason text not null, at timestamptz not null default now()
);
create table public.etime_trial_rate_limits (key text primary key, window_start timestamptz not null, hits integer not null);
create table public.etime_trial_templates (id text primary key, sha256 text not null, pdf_base64 text not null);
do $$ declare t text; begin
 foreach t in array array['config','grants','identities','sessions','forms','revisions','identity_audit','rate_limits','templates'] loop
 execute format('alter table public.etime_trial_%I enable row level security',t);
 execute format('revoke all on public.etime_trial_%I from anon, authenticated',t);
 execute format('grant all on public.etime_trial_%I to service_role',t);
 end loop;
end $$;

create function public.etime_trial_rate_limit(p_key text) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer; begin
 insert into public.etime_trial_rate_limits as r values(p_key,now(),1)
 on conflict(key) do update set hits=case when r.window_start < now()-interval '1 minute' then 1 else r.hits+1 end,
 window_start=case when r.window_start < now()-interval '1 minute' then now() else r.window_start end returning hits into n;
 delete from public.etime_trial_rate_limits where window_start < now()-interval '1 day';
 delete from public.etime_trial_sessions where expires_at < now();
 return n <= 30;
end $$;

-- A row lock + expected revision makes edits/initials/signatures atomic and prevents stale overwrites.
create function public.etime_trial_save(p_identity uuid,p_period date,p_expected integer,p_state jsonb,p_actor text,p_action text,p_employee boolean)
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
 return f;
end $$;

create function public.etime_trial_correct_identity(p_identity uuid,p_department uuid,p_employee_id text,p_first text,p_last text,p_actor text,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare old_i public.etime_trial_identities; new_i public.etime_trial_identities; f public.etime_trial_forms; s jsonb; begin
 select * into strict old_i from public.etime_trial_identities where id=p_identity and department_id=p_department for update;
 update public.etime_trial_identities set employee_id=p_employee_id,first_name=p_first,last_name=p_last where id=p_identity returning * into new_i;
 insert into public.etime_trial_identity_audit(identity_id,before_value,after_value,actor,reason)
 values(p_identity,to_jsonb(old_i)-'auth_user_id',to_jsonb(new_i)-'auth_user_id',p_actor,p_reason);
 -- Existing revisions keep their issued identities and signatures. New revisions require renewed signatures.
 for f in select * from public.etime_trial_forms where identity_id=p_identity order by id for update loop
 s := (f.state - 'employeeSignature' - 'managerSignature') || jsonb_build_object('identity',jsonb_build_object('employee_id',p_employee_id,'first_name',p_first,'last_name',p_last),'contentRevision',(f.state->>'contentRevision')::integer+1);
 update public.etime_trial_forms set state=s,revision=revision+1,updated_at=now() where id=f.id;
 insert into public.etime_trial_revisions(form_id,revision,state,action,actor) values(f.id,f.revision+1,s,'identity corrected: '||p_reason,p_actor);
 end loop;
 delete from public.etime_trial_sessions where identity_id=p_identity;
end $$;

revoke all on function public.etime_trial_rate_limit(text) from public,anon,authenticated;
revoke all on function public.etime_trial_save(uuid,date,integer,jsonb,text,text,boolean) from public,anon,authenticated;
revoke all on function public.etime_trial_correct_identity(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.etime_trial_rate_limit(text), public.etime_trial_save(uuid,date,integer,jsonb,text,text,boolean), public.etime_trial_correct_identity(uuid,uuid,text,text,text,text,text) to service_role;
-- Keep revision and identity audit immutable for the application service as well.
revoke update,delete,truncate on public.etime_trial_revisions,public.etime_trial_identity_audit from service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('etime-trial-private','etime-trial-private',false,15000000,array['application/pdf','font/ttf','application/octet-stream']) on conflict(id) do nothing;
