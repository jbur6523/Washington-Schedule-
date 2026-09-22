# Lead ICU Snapshot local review

Implemented from `docs/lead-command-board-icu-snapshot-management.md` on branch `feat/lead-icu-management`, based on main `48335e1`. The user approved the local preview and authorized release to main and production on September 22, 2026.

## Review

- Local app: http://127.0.0.1:3002/command-center
- Local synthetic login: `localadmin` / `LocalAdmin123!` (standard local seed).
- Desktop/mobile screenshots: `.codex-remote-attachments/local-review/lead-icu-desktop.png` and `lead-icu-mobile.png`.
- Sample records are explicitly marked “Local review fixture”; they are not production data or an authoritative room configuration.

The Lead surface is a presentation variant of `IcuCommandCenterClient`. It reuses its add form, numeric/device validation, discontinue dialog, outcome options, settings/airway formatters, activity snapshots, and realtime/polling. Desktop shows two tables; narrow screens stack groups and keep each Discontinue button visible. All applicable active records are loaded with pagination. ICU settings, notes and status editors remain available only in the full ICU surface.

Both surfaces now use the same atomic `manage_icu_device` RPC for Add and Discontinue. It derives staff attribution from the authenticated identity, preserves department scoping and existing constraints, and writes the record and audit event in one transaction. Discontinue locks the row and rejects stale updates. Leads acquire this limited capability and read access; the existing general INSERT/UPDATE RLS policies and full ICU permission checks remain unchanged. Existing ICU history, CT/MRI, status toggles, and normal edits remain in place.

Release dependency: `20260922184357_lead_icu_lifecycle.sql` must be applied before the client release. The user confirmed applying the supplied SQL to WHHS production; a production API check verified the lifecycle RPC exists and rejects anonymous calls with PostgreSQL permission error 42501. The migration was applied manually through SQL Editor, not through the connected migration tool. Synthetic review records stay local.

## Room configuration

The user confirmed IMC rooms 201–219, labeled `IMC - 201` through `IMC - 219`. These are now in the same shared `icuBedOptions` used by both Add forms. ICU rooms C220–C227, D230–D239, and E240–E249 are unchanged. The right-hand group is labeled **IMC**.

Both add forms use `availableIcuBeds`, combining the shared configuration with room numbers already saved in the department’s ICU records, including inactive records. Previously saved rooms remain available, and older A/B records still group under IMC without rewriting their history.

## Verification

- 79 relevant Vitest tests passed across 12 files (Lead/ICU components, permissions, shared helpers, announcement regression).
- 28 local database lifecycle checks passed: Lead access, RLS restrictions, actor attribution, cross-department denial, outcomes, stale writes, preservation of inactive history, duplicate-discontinue prevention, and rollback after audit failure.
- 11 existing ICU database checks passed, including status and CT history behavior.
- `npm run lint` and `npm run build` passed. A pre-existing ES5-incompatible Map iteration in the announcement test mock was changed to `Array.from` so the production TypeScript check passes.
- Browser: Add saved the shared ICU record/history; a Lead could not discontinue a Vent without an outcome, could discontinue with Extubation, and was denied the full ICU editing page. The full ICU board displayed the preserved add/discontinue activity afterward.
- Browser: all supported device types, notes and saved statuses render; 1440px desktop groups share a row, and 390px mobile groups stack without page overflow or hidden Discontinue actions.
- Live update verified from a local database change to the open Lead Board. The configured Supabase WebSocket origin was added to CSP to enable local realtime; existing hosted Supabase permissions remain supported.
- Local administrator membership was restored after the Lead-only browser check. Synthetic review records remain in the local database for review.
