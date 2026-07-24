# Lead Command Board Phone List

Phase 1 adds a saved phone-list draft workflow at `/command-center/phone-list`. Printing is intentionally outside this phase.

## Access

The route uses the existing `canManageShiftStatus` Lead Command Board guard. Access remains limited to:

- department Admin
- department Lead
- the department Command Center operations role

The database policies and save RPC use the matching `user_is_department_admin`, `user_is_department_lead`, and `user_is_command_center` predicates. No login, session, middleware, staff-activation, or general role-resolution behavior is changed.

## Schedule roster

The initial date and shift come from the existing America/Los_Angeles shift-status window. The user can then select any date and Day or Night shift.

The roster uses the department's active published schedule version plus active schedule overrides:

- only `scheduled` base entries are included
- `available` entries and `add_available` overrides are excluded
- active `remove_self` overrides remove their base entry
- active `add_self` overrides are included
- non-night scheduled categories, including RT Aide entries, appear with Day Shift
- `night_shift` entries appear with Night Shift

Because schedule entries do not have a persisted display-order column, the phone-list roster uses a stable, case-insensitive alphabetical order and de-duplicates staff-profile IDs.

## Staff selection and phone reuse

Each Staff Name field accepts:

- a roster number followed by Enter, Tab, or field blur
- an active staff-directory name through the native autocomplete list
- a manual free-text name

Directory selections save both `selected_staff_profile_id` and a server-confirmed name snapshot. Manual names save only the snapshot. If the same selected profile or normalized manual name appears more than once in a draft, entering or changing an extension synchronizes every matching assignment in that draft. Draft state is not shared across dates or shifts.

## Draft persistence

The form uses an explicit **Save Draft** action and shows `Saving`, `Saved`, unsaved, and safe error states. Navigating to a different date or shift warns before discarding unsaved entries.

`save_phone_list_draft` saves the header and all 31 canonical rows in one PostgreSQL transaction. It:

- derives the authenticated profile internally
- validates department membership and exact Lead Command Board access
- validates selected staff against the department
- rejects unknown or duplicate row keys
- rejects conflicting extensions for the same person
- serializes concurrent saves for the same department/date/shift
- upserts the unique draft and replaces its assignment rows atomically
- fills matching blank extensions from the same person's value within the submitted draft
- takes selected staff name snapshots from `staff_profiles`, not caller text

Direct browser writes to the two tables are not granted. Authenticated users with matching RLS access can read drafts, and the guarded RPC is the write boundary.

## Schema

Migration: `supabase/migrations/202607240001_lead_command_phone_list.sql`

- `phone_list_drafts`: one header per department, schedule date, and shift
- `phone_list_assignments`: the canonical row, selected profile reference, name snapshot, extension, order, and timestamps
- `save_phone_list_draft(uuid, date, text, jsonb)`: atomic, access-checked save RPC

The migration has not been applied by this feature branch. Before an approved application, run the read-only preflight in `supabase/manual/phone_list_preflight.sql`. After applying the single migration through the approved process, run `supabase/manual/phone_list_post_apply_verification.sql`.

Do not deploy the application route until the target project's migration and verification are complete.
