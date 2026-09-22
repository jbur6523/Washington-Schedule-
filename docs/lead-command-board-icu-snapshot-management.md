# Lead Command Board ICU Snapshot Management

This spec updates the ICU Snapshot section of the Lead Command Board.

**This file supersedes the ICU Snapshot requirements in `docs/lead-command-board-ui-refactor.md` wherever the two documents conflict.**

The goal is to make the ICU Snapshot on the **Lead Command Board** a lightweight management surface for active respiratory devices while keeping the existing **ICU Command Center as the source of truth**.

## Development / Review Requirements

- Implement these changes **locally first** for review.
- Do not push the implementation to `main`.
- Do not deploy the implementation.
- Do not create a second ICU data model, room list, status system, settings formatter, or ventilator outcome list.
- Inspect and reuse the existing ICU Command Center implementation before changing the Lead Board.
- Preserve all existing ICU Command Center behavior, history, auditing, realtime behavior, and data integrity.

## Source of Truth

The Lead Command Board ICU Snapshot must read from and write to the **same ICU Command Center records and workflows**.

Reuse the existing ICU Command Center data and helpers wherever possible, including the existing:

- `icu_patients` records
- `icu_patient_events` history
- Active/inactive lifecycle
- Room/bed configuration
- Supported device types
- Device settings
- Device-setting formatting
- ICU notes
- Vent statuses
- Standby state
- Ventilator outcomes
- Discontinue workflow
- Department scoping
- Realtime updates

Do not create Lead-Board-specific copies of any of these values.

The current code already contains reusable ICU helpers/constants such as:

- `icuDeviceLabels`
- `formatIcuDeviceSummary`
- `formatIcuSettings`
- `formatIcuAirway`
- `ventilatorOutcomeOptions`
- `ventilatorOutcomeLabels`

Reuse shared logic or extract shared presentation/actions where appropriate rather than duplicating them.

## Lead Board ICU Snapshot Layout

Replace the current simple read-only ICU Snapshot preview with a two-column management view.

### Left Side: ICU C-E

- Heading: **ICU C-E**
- Display active respiratory support records for the ICU C, D, and E units.
- Only display rooms that currently have an **active ICU Command Center record**.
- Do not render empty room placeholders.
- Sort active rooms by the existing room/bed ordering.

### Right Side: IMC A & B

- Heading: **IMC A & B**
- Display active respiratory support records for IMC A and B.
- Only display rooms that currently have an **active ICU Command Center record**.
- Do not render empty room placeholders.
- Sort active rooms by the existing room/bed ordering.

### Room Configuration

The room numbers have already been established through the ICU Command Center workflow/configuration.

- **Do not invent or independently hard-code room numbers in the Lead Board.**
- Locate and reuse the authoritative ICU Command Center room configuration/data.
- The intended visual grouping is:
  - ICU C-E on the left
  - IMC A-B on the right
- If the current checked-out branch contains newer IMC A/B room configuration than `main`, use that shared configuration.
- If IMC A/B room configuration truly does not yet exist in the authoritative ICU source, do not guess the room numbers. Add/support them through the same shared room configuration mechanism used by the ICU Command Center rather than creating a Lead-Board-only list.

On smaller screens, the two groups may stack vertically.

## Active Room Row

Each active room should display:

1. **Room Number**
2. **Device + Settings**
3. **Status**
4. **Discontinue**

Example structure:

| Room Number | Device (Settings) | Status | Action |
| --- | --- | --- | --- |
| D230 | Vent — APVCMV, Rate 18, VT 450, PEEP +5, FiO2 40% | SBT | Discontinue |
| E241 | BiPAP — Rate 12, IPAP 12, EPAP 6, FiO2 35% | Standby | Discontinue |

The example values are illustrative only. Always display the actual saved ICU Command Center data.

## Device and Settings Display

- Use the device type and settings already stored by the ICU Command Center.
- Do not add a Lead Board settings editor.
- The Lead Board is not intended for routine ventilator-setting changes.
- Use the existing shared ICU setting-formatting logic so the settings shown on the Lead Board match the ICU Command Center.
- Support all device types currently supported by the ICU Command Center rather than hard-coding only Vent/BiPAP/HFNC.
- If the supported device list changes in the ICU Command Center later, the Lead Board should inherit that change from shared configuration.

### Notes

If an ICU Command Center record contains a note:

- Display the note **directly underneath the device/settings summary** for that room.
- Style the note as secondary text so it is visible without overpowering the settings.
- Do not create a separate Notes column.
- Do not create a separate Lead Board notes field.
- Read the existing saved ICU note from the same ICU record.

Example:

```text
Vent — APVCMV
Rate 18 · VT 450 · PEEP +5 · FiO2 40%
Note: Weaning trial planned after rounds
```

## Status

The **Status** column must reflect the status already set in the ICU Command Center.

- Do not create a separate Lead Board status value.
- Do not add an independent status selector on the Lead Board.
- Reuse the existing saved ICU status fields and labels.
- Reuse the existing ICU Command Center status presentation logic/colors where practical.
- If more than one applicable status is active, show all applicable statuses in a compact readable way.
- If no status is set, display a subtle em dash or equivalent.

This includes the existing ICU Command Center status/state behavior such as SBT, Critical, Flolan, Prone, and Standby where applicable.

Changes made in the ICU Command Center must appear on the Lead Board, and changes to the underlying record from the Lead Board must immediately remain consistent with the ICU Command Center.

## Actions

The Lead Board ICU Snapshot should intentionally have a **limited management surface**.

### Do Not Add a General Update Settings Button

Do not add an `Update` button for device settings to each Lead Board row.

The Lead Board workflow should primarily support:

- **Add Device**
- **Discontinue**

If a room transitions from one support device to another, for example Vent to BiPAP:

1. Discontinue the existing active Vent record using the existing discontinue workflow.
2. Add the new BiPAP record using **Add Device**.

This preserves ICU history rather than silently changing one device type into another.

## Add Device

Add a prominent **+ Add Device** button in the top-right of the ICU Snapshot section.

Selecting **Add Device** should open an add flow that reuses the ICU Command Center's existing rules and validation.

The add flow should use the authoritative ICU Command Center values for:

- Unit/room
- Device type
- Device-specific settings
- Optional ICU note
- Any existing device-specific validation

Do not create a second list of devices or room numbers.

The Lead Board should support the same currently available device types as the ICU Command Center.

Adding a device from the Lead Command Board must create the same underlying ICU record and history event as adding it from the ICU Command Center.

## Discontinue

Each active room row should have a clearly visible **Discontinue** action.

Discontinue must reuse the existing ICU Command Center lifecycle rather than deleting a row.

- Set the existing record inactive through the established workflow.
- Preserve the record in ICU history.
- Create the same appropriate `icu_patient_events` history/audit entry.
- Preserve existing staff attribution.
- Preserve any existing discontinue date/time requirements and defaults.

### Ventilator Discontinue

When the active device is a **Vent**, discontinuing from the Lead Command Board must require the existing **Ventilator Outcome**.

- Use the existing Ventilator Outcome options and labels from the ICU Command Center.
- Do not create a new outcome list.
- Do not change the meaning of the existing outcomes.
- Save the outcome to the same existing field/history used by ICU Command Center discontinuation.

For non-Vent devices, follow the existing ICU Command Center discontinue confirmation behavior.

## Lead Permissions

The Lead Command Board is used by Lead users, so authorized Lead users must be able to perform the limited ICU actions defined here from the Lead Board.

Required Lead Board ICU capabilities:

- View active ICU/IMC respiratory-support records
- Add a device
- Discontinue an active device

Do **not** simply grant every Lead user full ICU Command Center editing access as a shortcut.

Instead:

- Create/reuse a narrowly scoped Lead Board ICU management capability if necessary.
- Preserve the existing full ICU Command Center access model.
- Leads should not gain unrestricted settings-edit access solely because this Lead Board feature exists.
- Update server-side authorization and Supabase/RLS/RPC behavior as necessary so the permission is enforced beyond the UI.
- Keep department scoping intact.

## Realtime / Synchronization

The Lead Command Board and ICU Command Center must remain synchronized because they represent the same records.

- An Add from the Lead Board should appear in ICU Command Center.
- A Discontinue from the Lead Board should disappear from both active views while remaining in history.
- ICU Command Center status changes should update the Lead Board.
- ICU Command Center note changes should update the Lead Board.
- ICU Command Center settings changes should update the Lead Board.
- ICU Command Center additions/discontinuations should update the Lead Board.

Reuse the existing realtime/polling approach where possible.

Do not keep the current six-record preview limit. The two Lead Board groups should show **all active respiratory-support rooms** for the applicable ICU C-E and IMC A-B areas.

## Visual Direction

Keep the ICU Snapshot visually lightweight so it does not make the Lead Command Board overwhelming.

- Keep it below Quick Operations.
- Use a clear two-column layout on desktop.
- Use **ICU C-E** and **IMC A & B** section headings.
- Use compact table/list rows.
- Avoid large nested cards for every room.
- Use light separators.
- Keep settings readable but compact.
- Display notes directly below settings in smaller secondary text.
- Display statuses as compact existing status treatments.
- Keep **Discontinue** obvious without making every row visually red.
- Place **+ Add Device** at the top-right of the overall ICU Snapshot section.

## Existing Functionality Must Remain Intact

Do not regress:

- ICU Command Center add/update functionality
- ICU Command Center notes
- ICU Command Center status toggles
- ICU Command Center history
- CT/MRI events
- Ventilator outcomes
- Discontinue history
- Department scoping
- Existing read-only ICU views
- Director/Command Center access
- Realtime synchronization
- Lead Command Board functionality outside the ICU Snapshot

## Tests / Verification

Add or update tests covering at minimum:

- Active ICU C-E records display in the left group.
- Active IMC A-B records display in the right group.
- Inactive/discontinued records do not display.
- All active applicable rooms display; there is no six-record truncation.
- Device settings match shared ICU formatting.
- Saved ICU notes display beneath device settings.
- Existing ICU statuses display from the underlying ICU status fields.
- Leads can Add Device from the Lead Board.
- Lead Add uses the same underlying ICU records/history as ICU Command Center Add.
- Leads can Discontinue from the Lead Board.
- Vent discontinuation requires an existing Ventilator Outcome.
- Non-Vent discontinuation follows the existing discontinue workflow.
- Discontinued records become inactive rather than being hard-deleted.
- Lead users do not gain unrestricted ICU settings-edit access.
- Existing ICU Command Center users retain their current access and functionality.
- Realtime/refetch behavior reflects ICU Command Center changes on the Lead Board.
- Responsive layout stacks cleanly at smaller widths.

Run the relevant unit/component tests, lint, and production build locally.

Leave the implementation in a local reviewable state. Do not push, merge, or deploy until explicitly approved.
