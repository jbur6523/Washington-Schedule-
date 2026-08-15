-- Leadership Current Shift detail reuses the durable Phone List roster snapshot.
-- Keep roster writes restricted to the existing capture RPC; this only extends
-- read access to roles that already have the Leadership Dashboard.

drop policy if exists "Lead Command Board users can read roster snapshots"
  on public.phone_list_roster_snapshots;
drop policy if exists "Leadership Dashboard users can read roster snapshots"
  on public.phone_list_roster_snapshots;
create policy "Leadership Dashboard users can read roster snapshots"
  on public.phone_list_roster_snapshots
  for select
  to authenticated
  using (
    public.user_is_department_admin(department_id)
    or public.user_is_department_lead(department_id)
    or public.user_is_command_center(department_id)
    or public.user_is_department_director(department_id)
    or public.user_is_department_leadership(department_id)
  );

drop policy if exists "Lead Command Board users can read roster snapshot entries"
  on public.phone_list_roster_entries;
drop policy if exists "Leadership Dashboard users can read roster snapshot entries"
  on public.phone_list_roster_entries;
create policy "Leadership Dashboard users can read roster snapshot entries"
  on public.phone_list_roster_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.phone_list_roster_snapshots snapshot
      where snapshot.id = phone_list_roster_entries.roster_snapshot_id
        and (
          public.user_is_department_admin(snapshot.department_id)
          or public.user_is_department_lead(snapshot.department_id)
          or public.user_is_command_center(snapshot.department_id)
          or public.user_is_department_director(snapshot.department_id)
          or public.user_is_department_leadership(snapshot.department_id)
        )
    )
  );
