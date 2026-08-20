# Local Supabase

WHHS Schedule development and schedule-import testing use Docker and the repository-pinned Supabase CLI `2.115.0`. Production data is never required.

## Start or rebuild

1. Start Docker Desktop.
2. Create `.env.local` with only the local values printed by `npx supabase status -o env`:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:61321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key>
   SUPABASE_SECRET_KEY=<local secret key>
   ```

3. Run `npm run supabase:start` for a clean, fully migrated, synthetic database.
4. Run `npm run dev` for local Next.js.

The setup script replays through the migration preceding the historical leadership-data dependency, inserts the local compatibility identity, applies the remaining migrations, and seeds synthetic data. It does not read a production dump.

Local services use project ID `whhs-schedule-local`; API port `61321`, database port `61322`, Studio port `61323`, and mail port `61324`. The test login is `localadmin` / `LocalAdmin123!`.

The seed includes exactly 998 schedule entries before August 23, 2026 and 16 on August 23. It also includes scheduled/available entries, Shift Leads, a Short Shift, an override, a coverage request/offer, a second department, and more than 1,000 active-version rows.

## Safety

`npm run supabase:guard` rejects both protected project references:

- production WHHS: `xkhqdcxnllogiogahdmd`
- unrelated application: `dltvqlyfuoklkjujwcxv`

It also rejects every configured non-local HTTP(S) Supabase URL. Reset, seed, database tests, and concurrency tests invoke this guard first. `.env.local`, CLI temporary state, and secrets are ignored by Git.

Never use `supabase db push` for local setup. The reproducible commands explicitly target `--local`.

## Tests

```powershell
npm run supabase:test
npm run supabase:test:concurrency
```

The pgTAP suite proves the original 1,000-row failure, atomic import behavior, authorization, retry restoration, conflicts, range extension, complete audit rows, final-row rollback, exact uniqueness, split shifts, Short Shift behavior, and the duplicate-repair algorithm. The concurrency test uses two authenticated local sessions and cleans up its synthetic rows.
