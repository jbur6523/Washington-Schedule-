-- Permanent username is globally unique. Never create a second staff identity.
-- Empty/synthetic databases may not contain this production roster member.
begin;

update public.staff_profiles
set assigned_role = 'lead'::public.app_role
where username_normalized = 'alia'
  and assigned_role is distinct from 'lead'::public.app_role;

-- The existing access trigger synchronizes role changes. Also repair a stale
-- membership when the profile was already promoted before this migration.
update public.department_memberships membership
set role = 'lead'::public.app_role
from public.staff_profiles staff
where staff.username_normalized = 'alia'
  and membership.profile_id = staff.profile_id
  and membership.department_id = staff.department_id
  and membership.role is distinct from 'lead'::public.app_role;

commit;
