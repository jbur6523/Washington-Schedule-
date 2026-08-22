# Procedure Metrics

The admin-only `/admin/metrics/procedures?month=YYYY-MM` page reports procedure activity from the existing canonical `shift_status_updates` records. Metrics is a reporting surface only; Leads continue to enter procedures through Shift Updates.

## Data source and categories

The report uses these persisted fields and Shift Update labels:

- `c_section_count` — C-Sections
- `vaginal_delivery_count` — Vaginal Deliveries
- `cabg_count` — CABG
- `bronch_count` — Bronchs
- `sputum_induction_count` — Sputum Inductions
- `other_procedure_count` — MRI

`other_procedure_note` is free text and has no numeric count, so it is not treated as a seventh procedure category. The hero total, category table, daily totals, and shift totals all use the same six-field sum.

## Canonical aggregation

Queries are department-scoped and select only `is_canonical = true` rows whose operational `shift_date` is August 14, 2026 or later. The same cutoff is enforced by the aggregation layer. The canonical History migration enforces at most one current row for each department, operational `shift_date`, and Day/Night `shift_type`. `save_shift_status_update` updates that row in place under a transaction lock, so corrections replace the prior contribution. Noncanonical legacy duplicates, audit revisions, and all pre-cutoff records are excluded.

The operational date comes directly from the Shift Update record and is resolved by the existing Pacific reporting-window workflow. Edit timestamps do not move a shift into another month. A canonical row containing six zeroes is a submitted zero shift; the absence of a canonical row is missing data.

## Formulas

- Monthly total: sum of all six procedure fields across selected-month canonical shifts.
- Average per day: total divided by tracked Pacific calendar days. The initial August 2026 period begins on August 14; later months use elapsed days for the current month or all calendar days for a completed month.
- Average per reported shift: total divided by canonical Day/Night shifts with a submitted Shift Update, including submitted zeroes.
- Current-month comparison: month to date versus the same numbered calendar days in the prior month.
- Historical comparison: full selected month versus the full immediately preceding month.
- Three-month average: up to the three most recent available, fully reliable, completed months before the selected reporting month. Missing months and a partial current month are excluded, not inserted as zeroes.
- Trend rolling average: up to three available completed months. The current month uses completed months only.

True procedure metrics tracking begins August 14, 2026. No data with an operational date before that cutoff is queried or aggregated. August 2026 is labeled partial coverage and is excluded from completed-month averages; September 2026 is the first possible complete month. No backfill or monthly summary table is created.

## Access and query shape

The route verifies the existing admin Metrics authorization on the server before creating the Supabase client. The query remains protected by the existing department-membership RLS policy, requests only canonical rows in a bounded reporting range, and paginates with a deterministic order. All aggregation runs in the Server Component data path; the browser receives only the finished report.

## Daily detail

Daily Detail renders only dates from the selected month and shows at most seven days at once. Current-month reports open on the seven-day page containing today; historical months open on their first page. Previous and Next replace the visible dates without loading or appending data.

Dates are collapsed by default. The collapsed row shows Day/Night totals, positive procedure categories only, and a compact missing-update message. Expanding a date reveals every procedure category, including zero values, for both canonical shifts. Opening another date closes the prior audit detail. A submitted zero remains distinct from a missing shift update.
