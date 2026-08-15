# RVU & Staffing Metrics

The admin-only `/admin/rvu-staffing-metrics` page summarizes exact RVUs and manual RTs On Shift from the canonical `shift_status_updates` reporting-window records.

## Data model

- `rvu_total` is nullable PostgreSQL `numeric` and retains the exact raw RVU input.
- `rts_on` remains the existing manually entered, authoritative RTs On Shift value.
- `rts_required` remains the downstream RTs Needed value and is server-derived as `round(rvu_total / 27, 1)`.
- Historical rows are not backfilled. Null RVUs mean RVU data is unavailable and are excluded from metrics rather than counted as zero.
- The first save in a 04:00/16:00 Pacific reporting window inserts the row. Corrections during that same window update the latest canonical row under a transaction lock. Omitted fields are preserved.

## Access

The Admin panel is the only navigation entry. The route verifies the authenticated context server-side with the centralized admin-only permission before creating its data client or querying the department. The query selects only reporting date, shift, RVU/staffing values, and deterministic row timestamps; updater names, notes, equipment, procedures, and patient-related data are not loaded.

## Metrics

Filters support 7, 30, and 90 days, one year, or all data, plus all/day/night shifts. The default is 30 days and all shifts. The page includes:

- summary averages, exact-need staffing variance, and percentage meeting need;
- an accessible chronological RVU trend with a compact detail table;
- Day versus Night comparison;
- Winter, Spring, Summer, and Fall summaries with cross-year winter labels.

Analytics use exact `rvu_total / 27` values and round only displayed values to one decimal place.
