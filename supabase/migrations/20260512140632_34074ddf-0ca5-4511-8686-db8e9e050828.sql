
create table public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  restaurant text,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_submissions enable row level security;

-- Allow anyone (including unauthenticated visitors) to submit a contact form.
create policy "Anyone can submit a contact message"
  on public.contact_submissions
  for insert
  to anon, authenticated
  with check (true);
