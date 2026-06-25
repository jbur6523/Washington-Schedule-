# Coworker Titles

Coworker Titles are personal, private labels that each staff member can assign to coworkers.

They are not official roles, do not affect permissions, and are not visible to other staff.

## Preset Titles

| Title | Icon |
| --- | --- |
| Bestie | ✨ |
| Work Wife | 💍 |
| Work Husband | 💅 |
| Ride or Die | 🚗 |
| Emotional Support Coworker | 🧸 |
| Frenemy | 👀 |
| Trauma Bonded | 🚑 |

Multiple preset titles can be assigned to the same coworker.

## Custom Titles

Users can also create private custom titles for a coworker from the same bottom sheet.

Custom title rules:

- Title is required.
- Title max length is 24 characters.
- Emoji/icon is required.
- Emoji/icon max length is 4 characters.
- Duplicate custom titles are not allowed for the same owner/coworker pair.
- Each user can add up to 3 custom titles per coworker.

Custom title examples:

- `Snack Queen` with `☕`
- `Night Shift Hero` with `🌙`
- `Chaos Coordinator` with `🌀`

Custom titles are still private to the user who created them.

## Staff Directory

Staff can tap a coworker's Staff Directory card action to open the `Coworker Titles` bottom sheet and select one or more preset titles.

The same sheet includes a `Custom Title` section where the user can add and remove custom title/icon pairs.

Self-tags are not allowed in this phase. Titles are saved only for the signed-in staff member.

## Schedule Icons

Schedule cards show only small title icons next to the coworker's name.

Preset titles show preset icons. Custom titles show only the user's custom emoji/icon.

Full title text is available through the icon hover/tap title or inside the Staff Directory title editor. The Schedule screen does not show full preset or custom title words, phone numbers, usernames, claim status, or account-management details.

## Data Model

`coworker_titles` stores one row per owner, target coworker, and title.

Important fields:

- `department_id`
- `owner_staff_profile_id`
- `target_staff_profile_id`
- `title_key`
- `custom_title`
- `custom_icon`
- `is_custom`

Preset titles use `title_key`. Custom titles use `custom_title`, `custom_icon`, and `is_custom = true`.

The preset unique key is:

- `department_id`
- `owner_staff_profile_id`
- `target_staff_profile_id`
- `title_key`

The custom title unique key is:

- `department_id`
- `owner_staff_profile_id`
- `target_staff_profile_id`
- normalized `custom_title`

## RLS

RLS keeps coworker titles private:

- Users can read only rows where they are the `owner_staff_profile_id`.
- Users can insert, update, and delete only their own rows.
- Rows must be scoped to the user's department.
- `owner_staff_profile_id` cannot equal `target_staff_profile_id`.
- No public access is allowed.

Admins do not see everyone else's coworker titles through the normal app UI.
