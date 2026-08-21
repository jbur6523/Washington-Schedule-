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

Queries are department-scoped and select only `is_canonical = true` rows. The canonical History migration enforces at most one current row for each department, operational `shift_date`, and Day/Night `shift_type`. `save_shift_status_update` updates that row in place under a transaction lock, so corrections replace the prior contribution. Noncanonical legacy duplicates and audit revisions are retained but excluded.

The operational date comes directly from the Shift Update record and is resolved by the existing Pacific reporting-window workflow. Edit timestamps do not move a shift into another month. A canonical row containing six zeroes is a submitted zero shift; the absence of a canonical row is missing data.

## Formulas

- Monthly total: sum of all six procedure fields across selected-month canonical shifts.
- Average per day: total divided by elapsed Pacific calendar days for the current month, or all calendar days for a completed month.
- Average per reported shift: total divided by canonical Day/Night shifts with a submitted Shift Update, including submitted zeroes.
- Current-month comparison: month to date versus the same numbered calendar days in the prior month.
- Historical comparison: full selected month versus the full immediately preceding month.
- Three-month average: up to the three most recent available, fully reliable, completed months before the selected reporting month. Missing months and a partial current month are excluded, not inserted as zeroes.
- Trend rolling average: up to three available completed months. The current month uses completed months only.

Type-level history is reliable beginning July 6, 2026, when the final current procedure field (`vaginal_delivery_count`) became persistable. July 2026 is therefore labeled partial coverage and is excluded from completed-month averages. No backfill or monthly summary table is created.

## Access and query shape

The route verifies the existing admin Metrics authorization on the server before creating the Supabase client. The query remains protected by the existing department-membership RLS policy, requests only canonical rows in a bounded reporting range, and paginates with a deterministic order. All aggregation runs in the Server Component data path; the browser receives only the finished report.
