# ICU Command Center

The ICU Command Center is an operational respiratory snapshot tool for ICU beds. It replaces the paper ICU respiratory tracking sheet with a department-scoped app workflow.

This is not patient charting. The app must not collect patient names, MRNs, DOBs, diagnoses, or patient-identifying notes. ICU entries use bed/room plus respiratory device/settings only.

## Route

Primary edit route:

`/icu-command-center`

Respiratory Command Center read-only route:

`/command-center/icu-snapshot`

Director read-only access is embedded in:

`/director/shift-status`

## Access

Edit access:

- Admin
- `staff_profiles.operations_role = icu_command_center`

Read-only access:

- `staff_profiles.operations_role = director`
- `staff_profiles.operations_role = command_center`

Denied:

- Regular Staff
- Lead users unless separately granted Admin or ICU Command Center access
- Aide users
- Unauthenticated users

The dedicated ICU shared-device username is:

- `ventilator`

The `ventilator` account routes directly to `/icu-command-center` after login.

## Bed Options

Phase 1 supports these ICU beds:

- C220-C227
- D230-D239
- E240-E249

The options live in code so they can be updated without changing patient records.

## Devices and Settings

Supported devices:

- Vent
- BiPAP
- CPAP
- HFNC

Vent entries can include:

- Airway size
- Airway at
- Airway location
- Vent mode
- Mode-specific settings
- Critical Vent flag

Vent modes:

- APVCMV
- SCMV
- SPONT
- ASV
- PCMV
- APRV

BiPAP settings:

- Rate
- IPAP
- EPAP
- FiO2

CPAP settings:

- CPAP

HFNC settings:

- FiO2
- Flow

## Snapshot Counts

ICU Snapshot shows:

- Vents
- HFNC
- BiPAP
- Critical Vents

The Critical Vents count includes only active Vent entries where Critical Vent is checked.

## Active Card Actions

Active ICU cards use these actions:

- `Update`: opens the device/settings form with current values.
- `Discontinue`: opens a confirmation flow and removes the device from the active ICU list without hard-deleting the record.
- `History`: opens a read-only change history for that ICU record.

Vent cards show a compact top-right overflow action. Its persistent status toggles are SBT, Critical, Flolan, and Prone. Critical reuses `icu_patients.is_critical_vent`; SBT, Flolan, and Prone use additive boolean fields on the same active ICU row. They persist across refreshes, devices, logins, and shift boundaries until manually cleared. Critical gives the card an accessible red treatment, SBT gives a non-critical card an accessible blue treatment, and active SBT, Proned, and On Flolan modifiers remain visible on a separate status line.

The same menu records CT and MRI as operational board events, not patient locations or transport timestamps. Each event is retained permanently in `icu_patient_events` with an America/Los_Angeles operational date and Day/Night identifier. A partial unique index permits only one CT and one MRI event per Vent per 07:00/19:00 shift. The next shift therefore appears unmarked without deleting history or running a scheduled reset.

The separate Recently Updated section is intentionally not shown. Each card still shows its own last-updated time.

The bottom of the page shows `Today's ICU Activity`, which lists ICU activity events for the current America/Los_Angeles calendar date. It is driven by saved ICU history events, not by the active card list.

## Discontinue Workflow

Non-vent devices show a confirmation modal before discontinuing:

- Bed
- Device
- Current settings summary
- Discontinued Date
- Discontinued Time

Discontinued Date and Discontinued Time default to the current America/Los_Angeles date/time and are required for Vent, BiPAP, CPAP, and HFNC.

Vent devices also require a Ventilator Outcome before discontinuing. Supported outcomes:

- Extubation
- Trached Aerosol
- Unplanned
- Expired (on ventilator)
- Transferred to another facility
- Donor network
- Discontinue Vent Support (Palliative)

Discontinued records stay available in history/search.

## History and Previous Date Search

Each ICU card includes a `History` button. History records show added, updated, critical status updated, and discontinued events with the display name/initials of the staff member who made the change.

`Search Previous Date` accepts `MMDDYY` input and opens a read-only list of ICU activity events saved for that date. It is for operational review only and does not expose patient identifiers.

## Data Model

The `icu_patients` table stores active and discontinued ICU operational entries. Discontinue actions set `is_active = false`; records are not hard-deleted.

The table includes department scope, bed, device type, device settings, Critical Vent, Discontinued At, Discontinued By, Ventilator Outcome when a Vent is discontinued, active state, created/updated staff profile IDs, and timestamps.

The `icu_patient_events` table stores ICU lifecycle history:

- `added`
- `updated`
- `critical_status_updated`
- `sbt_status_updated`
- `flolan_status_updated`
- `prone_status_updated`
- `discontinued`
- `ct_noted`
- `mri_noted`

History rows store event summaries, safe device/settings details, visible staff attribution, and timestamps. They must not store patient names, MRNs, DOBs, diagnoses, or patient-identifying notes.

Add/Update Patient errors appear as an inline red banner at the top of the modal so the user can see and correct the issue without closing the modal.

`event_time` is the effective time of ordinary ICU lifecycle events. Discontinued events use the selected Discontinued Date and Discontinued Time. Status and CT/MRI audit entries use the board-update timestamp and are labeled that way; they never claim a clinical start, stop, prone, or transport time.

Daily activity and previous-date searches use America/Los_Angeles date boundaries. Search Previous Date accepts `MMDDYY` and returns saved ICU activity events for that date, including discontinued devices.

## Privacy Guardrails

Do not enter:

- Patient names
- MRNs
- DOBs
- Diagnoses
- Patient-identifying notes
- Clinical free-text notes

No notes field exists in Phase 1 to reduce accidental PHI entry.

## Out of Scope

- Patient charting
- EMR integration
- Patient diagnosis tracking
- Clinical notes
- Automatic ventilator device import
- Alerts/escalations
- Historical analytics beyond inactive records
