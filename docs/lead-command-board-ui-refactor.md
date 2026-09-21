# Lead Command Board UI Refactor

Use the attached/reference mockup as the visual direction for updating the desktop **Lead Command Board / Live Board**.

- This is primarily a **layout and visual hierarchy redesign**.
- Preserve all existing functionality, data sources, permissions, routes, database behavior, and actions.
- Make the actual UI changes **locally only** so they can be reviewed before any production work.
- Do **not** merge or push the UI implementation to `main`.
- Do **not** deploy the UI implementation to production.
- Inspect the existing implementation first and reuse current components, APIs, actions, and data wherever possible.
- Run relevant tests/build checks when finished.
- Treat the screenshot as a design reference rather than a strict pixel-for-pixel requirement.

## Header / Navigation

- Keep the existing:
  - Lead Command Board title
  - Live Board
  - Schedule
  - History
- Preserve all current navigation behavior.

## Announcements

- Move the current Announcement Board functionality into a slim, front-facing **Announcements** strip directly below the Live Board / Schedule / History navigation.
- Display the current/latest announcement directly on the dashboard.
- Include:
  - Announcement icon/title
  - Current announcement preview
  - `View All`
  - Existing edit/update functionality for authorized users
- `View All` should open the existing/full announcement experience or an appropriate page showing all announcements.
- Remove the separate large **Announcement Board** action card from the dashboard because the information is now front-facing.
- Do not remove any underlying announcement functionality.

## Primary Dashboard Row

- Replace the current six individual statistic boxes with three larger, cleaner columns.

### Staffing

- Use the first column.
- Consolidate the information currently represented by:
  - Staff Needed
  - Staff on Shift
- Display:
  - Needed / required staffing value
  - Staff on shift
  - Coverage difference/status
- Continue using the existing staffing calculations and data.
- Use restrained status styling such as green for adequate staffing.

### Respiratory Load

- Use the second column.
- Display:
  - Vent Count
  - BiPAP Count
  - Active Rentals
  - Procedures
- Continue using all existing data and procedure functionality.
- If procedures currently has a `View Procedures` action, preserve access to it appropriately.

### Lead Note

- Use the third column as a front-facing **Lead Note** panel.
- Display:
  - Current/latest lead communication note
  - Updated time
  - Author, if available
  - Edit control for authorized users
  - `View All`
- `View All` should open the full Lead Communication Board/history so previous communication remains available.
- Preserve the existing Lead Communication Board functionality behind this interface.
- Remove the separate large **Lead Communication Board** action card because the current note is now visible directly on the dashboard.
- Do not delete or replace the underlying communication system.

## Quick Operations

- Add a lighter **Quick Operations** section below the three primary panels.
- Include:
  - Shift Update
  - Phone List
  - Aide Communication Board
  - Rental Management
  - Short Shift Alert
- Preserve the existing click behavior and functionality of every item.
- Do not remove the **Aide Communication Board**.
- Use smaller, visually quieter controls than the status panels above.
- Avoid oversized descriptions and heavy card styling.
- Keep enough spacing between controls that the page does not feel cramped.

## ICU Snapshot

- At the bottom of the dashboard, add/preserve the ICU Snapshot as a simple, lightweight table.
- The dashboard preview only needs three columns:
  - **Room Number**
  - **Device**
  - **Notes**
- Example:

| Room Number | Device | Notes |
| --- | --- | --- |
| ICU 1 | Vent | Stable |
| ICU 2 | HFNC | High acuity |

- Do not add additional columns unless required by existing functionality.
- Keep the table visually minimal:
  - Very light separators
  - Minimal borders
  - No nested heavy card treatment
  - Compact rows
  - `View All` for the full ICU Snapshot experience
- Design this section so it can scale when ICU Snapshot is rolled out department-wide.

## Visual Direction

- Make the dashboard feel significantly calmer and less like a wall of boxes.
- Follow this hierarchy:
  1. Header/navigation
  2. Slim announcement strip
  3. Staffing / Respiratory Load / Lead Note
  4. Quick Operations
  5. ICU Snapshot
- Use:
  - More whitespace between major sections
  - Fewer heavy outlines
  - Light gray/subtle separators
  - Existing WHHS blue styling where appropriate
  - Larger text/numbers for important operational information
  - Smaller styling for secondary actions
  - Consistent alignment and spacing
- Not everything needs to be enclosed in a prominent card.
- Keep the existing WHHS visual identity rather than introducing a completely new design system.

## Responsive Behavior

- This redesign is primarily for the **desktop Lead Command Board**.
- Do not break existing mobile/tablet behavior.
- If the desktop design cannot translate cleanly to smaller widths, preserve or intelligently adapt the current responsive layout rather than forcing the desktop arrangement onto mobile.

## Functional Regression Requirements

- Verify that all existing functionality still works:
  - Live Board
  - Schedule
  - History
  - Shift Update
  - Phone List
  - Lead Communication Board / Lead Notes
  - Aide Communication Board
  - Rental Management
  - Short Shift Alert
  - Announcements
  - Procedure viewing
  - ICU Snapshot
  - Existing role/permission restrictions
  - Existing persistence/database behavior
- This should be a **UI/UX restructuring of the existing dashboard, not a rewrite of its functionality**.
- Run the project locally and leave it in a reviewable state.
- Do not push, merge, or deploy the UI implementation until it has been reviewed.
