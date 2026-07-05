alter type public.rental_record_status add value if not exists 'pickup_requested';
alter type public.rental_record_status add value if not exists 'pickup_called';
alter type public.rental_record_status add value if not exists 'picked_up';
