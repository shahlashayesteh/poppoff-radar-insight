alter table public.contact_submissions
  add column if not exists role text,
  add column if not exists venue_count text,
  add column if not exists monthly_revenue_band text,
  add column if not exists current_pos text,
  add column if not exists phone text,
  add column if not exists audit_goal text,
  add column if not exists source text;

grant insert on public.contact_submissions to anon, authenticated;
grant all on public.contact_submissions to service_role;