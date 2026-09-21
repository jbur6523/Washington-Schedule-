# Lead Command Board local review

Implementation follows `lead-command-board-ui-refactor.md` and was reviewed locally on
`ui/lead-command-board-refactor`. After approving the design and requesting a yellow
announcement tint, the user authorized pushing to main and deploying to production.
The notes below document the pre-deployment local review.

## Review locally

- Running review build: http://127.0.0.1:3002/command-center
- Local synthetic account: `localadmin` / `LocalAdmin123!` (documented in `local-supabase.md`).
- The ignored `.env.local` now connects to the existing local Supabase instance on port 61321.
- Restart with `npm run build` then `npm run start -- --hostname 127.0.0.1 --port 3002`.
- Desktop and mobile screenshots are in `.codex-remote-attachments/lead-board-desktop.png` and `.codex-remote-attachments/lead-board-mobile.png` (ignored local artifacts).

## Implementation details

- Announcements now show the current title and message in a slim strip. View All opens the full current announcement; Edit opens the existing editor. The existing database stores one current announcement per department, so no new archive or persistence behavior was introduced.
- Staffing and Respiratory Load group the existing six metrics. Coverage is staff on shift minus required staff. Missing data stays unavailable, rather than appearing as zero. Procedure and shift-note dialogs remain accessible.
- Lead Note shows the newest non-closed communication, timestamp, author, urgency, and unread badge. View All opens the existing communication board. The existing system does not edit note text; its authorized creation action is accurately labeled Add note. Replies, read status, closing, and existing history behavior remain in the full board.
- Quick Operations retains all five existing actions, including the Aide Communication Board.
- ICU Snapshot displays up to six active rooms in the requested three columns. View All retains the full ICU route. Preview queries use the existing department filters, ICU access checks, and authenticated client. Realtime subscriptions and a one-minute refresh keep previews current.
- No routes, APIs, database schema, persistence actions, or permission rules changed.

## Validation

- Production build, TypeScript, ESLint, and `git diff --check` passed.
- 57 relevant tests passed across dashboard, previews, announcement UI, communication boards, and access rules. After the final breakpoint and compact-label adjustment, all 33 directly affected tests passed again.
- Browser review of the actual local app at desktop 1280px, tablet 768px, and mobile 390px; no horizontal overflow at tablet or mobile widths.
- Opened announcement details/editor and both communication boards.
- Loaded Schedule, History, Shift Update, Phone List, Rental Management, Short Shift Alert, and ICU Snapshot.
- Final local production-build browser checks reported no runtime errors. The initial development server had pre-existing CSP warnings; the local production build avoided those development-only warnings.
- Populated/urgent note previews, ICU rows, failure states, realtime refresh, authorization, and procedure interactions are covered by component tests. The local browser dataset had no current announcement, lead note, or active ICU rows, so screenshots show those empty states. No production writes or live message submissions were used for validation.
