# Coworker Titles

Coworker Titles are personal, private labels that each staff member can assign to coworkers.

They are not official roles, do not affect permissions, and are not visible to other staff.

## Allowed Titles

| Title | Icon |
| --- | --- |
| Bestie | ✨ |
| Work Wife | 💍 |
| Work Husband | 💅 |
| Ride or Die | 🚗 |
| Emotional Support Coworker | 🧸 |
| Frenemy | 👀 |
| Trauma Bonded | 🚑 |

Multiple titles can be assigned to the same coworker.

## Staff Directory

Staff can tap a coworker's Staff Directory card action to open the `Coworker Titles` bottom sheet and select one or more titles.

Self-tags are not allowed in this phase. Titles are saved only for the signed-in staff member.

## Schedule Icons

Schedule cards show only small title icons next to the coworker's name.

Full title text is available through the icon hover/tap title or inside the Staff Directory title editor. The Schedule screen does not show full title words, phone numbers, usernames, claim status, or account-management details.

## Data Model

`coworker_titles` stores one row per owner, target coworker, and title.

Important fields:

- `department_id`
- `owner_staff_profile_id`
- `target_staff_profile_id`
- `title`

The unique key is:

- `department_id`
- `owner_staff_profile_id`
- `target_staff_profile_id`
- `title`

## RLS

RLS keeps coworker titles private:

- Users can read only rows where they are the `owner_staff_profile_id`.
- Users can insert, update, and delete only their own rows.
- Rows must be scoped to the user's department.
- `owner_staff_profile_id` cannot equal `target_staff_profile_id`.
- No public access is allowed.

Admins do not see everyone else's coworker titles through the app UI.
