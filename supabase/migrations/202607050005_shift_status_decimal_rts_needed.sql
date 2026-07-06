alter table public.shift_status_updates
  alter column rts_required type numeric(5, 2)
  using rts_required::numeric(5, 2);
