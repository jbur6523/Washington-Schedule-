do $$
begin
  alter type public.app_role add value if not exists 'lead';
exception
  when duplicate_object then null;
end $$;
