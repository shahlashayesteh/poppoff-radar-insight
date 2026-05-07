-- ============== SERVER STATS ==============
create table public.server_stats (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null,
  week_start date not null,
  total_covers integer not null default 0,
  total_sales numeric not null default 0,
  wine_sales numeric not null default 0,
  dessert_sales numeric not null default 0,
  cocktail_sales numeric not null default 0,
  spend_per_cover numeric generated always as
    (case when total_covers > 0 then total_sales / total_covers else 0 end) stored,
  wine_conversion numeric generated always as
    (case when total_sales > 0 then wine_sales / total_sales * 100 else 0 end) stored,
  dessert_conversion numeric generated always as
    (case when total_sales > 0 then dessert_sales / total_sales * 100 else 0 end) stored,
  cocktail_conversion numeric generated always as
    (case when total_sales > 0 then cocktail_sales / total_sales * 100 else 0 end) stored,
  created_at timestamptz not null default now(),
  unique (venue_id, user_id, week_start)
);
alter table public.server_stats enable row level security;

create policy "Servers read own stats" on public.server_stats
  for select using (user_id = auth.uid());
create policy "Managers read venue stats" on public.server_stats
  for select using (exists (select 1 from public.venues v where v.id = server_stats.venue_id and v.manager_id = auth.uid()));
create policy "Managers insert venue stats" on public.server_stats
  for insert with check (exists (select 1 from public.venues v where v.id = server_stats.venue_id and v.manager_id = auth.uid()));
create policy "Managers update venue stats" on public.server_stats
  for update using (exists (select 1 from public.venues v where v.id = server_stats.venue_id and v.manager_id = auth.uid()));

-- ============== SERVER TARGETS ==============
create table public.server_targets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null,
  spend_per_cover_target numeric not null default 60,
  wine_target numeric not null default 25,
  dessert_target numeric not null default 15,
  cocktail_target numeric not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, user_id)
);
alter table public.server_targets enable row level security;

create policy "Servers read own targets" on public.server_targets
  for select using (user_id = auth.uid());
create policy "Managers read venue targets" on public.server_targets
  for select using (exists (select 1 from public.venues v where v.id = server_targets.venue_id and v.manager_id = auth.uid()));
create policy "Managers insert venue targets" on public.server_targets
  for insert with check (exists (select 1 from public.venues v where v.id = server_targets.venue_id and v.manager_id = auth.uid()));
create policy "Managers update venue targets" on public.server_targets
  for update using (exists (select 1 from public.venues v where v.id = server_targets.venue_id and v.manager_id = auth.uid()));

create trigger trg_server_targets_updated
  before update on public.server_targets
  for each row execute function public.touch_updated_at();

-- ============== SERVER STREAKS ==============
create table public.server_streaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  venue_id uuid not null references public.venues(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_hit_week date,
  updated_at timestamptz not null default now(),
  unique (user_id, venue_id)
);
alter table public.server_streaks enable row level security;

create policy "Servers read own streaks" on public.server_streaks
  for select using (user_id = auth.uid());
create policy "Managers read venue streaks" on public.server_streaks
  for select using (exists (select 1 from public.venues v where v.id = server_streaks.venue_id and v.manager_id = auth.uid()));

create trigger trg_server_streaks_updated
  before update on public.server_streaks
  for each row execute function public.touch_updated_at();

-- ============== SERVER MILESTONES ==============
create table public.server_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  venue_id uuid not null references public.venues(id) on delete cascade,
  milestone_type text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, venue_id, milestone_type)
);
alter table public.server_milestones enable row level security;

create policy "Servers read own milestones" on public.server_milestones
  for select using (user_id = auth.uid());
create policy "Managers read venue milestones" on public.server_milestones
  for select using (exists (select 1 from public.venues v where v.id = server_milestones.venue_id and v.manager_id = auth.uid()));

-- ============== VENUE MENU ==============
create table public.venue_menu (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  menu_text text not null,
  uploaded_at timestamptz not null default now()
);
alter table public.venue_menu enable row level security;

create policy "Managers insert venue menu" on public.venue_menu
  for insert with check (exists (select 1 from public.venues v where v.id = venue_menu.venue_id and v.manager_id = auth.uid()));
create policy "Managers read venue menu" on public.venue_menu
  for select using (exists (select 1 from public.venues v where v.id = venue_menu.venue_id and v.manager_id = auth.uid()));
create policy "Servers read venue menu" on public.venue_menu
  for select using (exists (select 1 from public.venue_members vm where vm.venue_id = venue_menu.venue_id and vm.user_id = auth.uid()));

-- ============== FUNCTIONS ==============
create or replace function public.calculate_performance_colour(actual numeric, target numeric)
returns text
language sql
immutable
as $$
  select case
    when target is null or target = 0 then 'amber'
    when actual >= target then 'green'
    when actual >= target * 0.8 then 'amber'
    else 'red'
  end;
$$;

create or replace function public.update_streaks_and_milestones(_user_id uuid, _venue_id uuid, _week_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stat public.server_stats%rowtype;
  v_target public.server_targets%rowtype;
  v_hit boolean := false;
  v_streak public.server_streaks%rowtype;
  v_new_current integer := 0;
  v_new_longest integer := 0;
  v_max_spc numeric;
  v_top25_threshold numeric;
begin
  select * into v_stat from public.server_stats
    where user_id = _user_id and venue_id = _venue_id and week_start = _week_start;
  if not found then return; end if;

  select * into v_target from public.server_targets
    where user_id = _user_id and venue_id = _venue_id;

  if found then
    v_hit := v_stat.spend_per_cover >= v_target.spend_per_cover_target
         and v_stat.wine_conversion >= v_target.wine_target
         and v_stat.dessert_conversion >= v_target.dessert_target
         and v_stat.cocktail_conversion >= v_target.cocktail_target;
  end if;

  insert into public.server_milestones (user_id, venue_id, milestone_type)
    values (_user_id, _venue_id, 'first_week_complete')
    on conflict do nothing;

  select * into v_streak from public.server_streaks
    where user_id = _user_id and venue_id = _venue_id;

  if not found then
    insert into public.server_streaks (user_id, venue_id, current_streak, longest_streak, last_hit_week)
      values (_user_id, _venue_id, case when v_hit then 1 else 0 end, case when v_hit then 1 else 0 end, case when v_hit then _week_start else null end)
      returning * into v_streak;
  else
    if v_hit then
      v_new_current := v_streak.current_streak + 1;
      v_new_longest := greatest(v_streak.longest_streak, v_new_current);
      update public.server_streaks
        set current_streak = v_new_current, longest_streak = v_new_longest, last_hit_week = _week_start
        where id = v_streak.id;
      v_streak.current_streak := v_new_current;
      v_streak.longest_streak := v_new_longest;
    else
      update public.server_streaks
        set current_streak = 0
        where id = v_streak.id;
      v_streak.current_streak := 0;
    end if;
  end if;

  if v_streak.current_streak >= 5 then
    insert into public.server_milestones (user_id, venue_id, milestone_type)
      values (_user_id, _venue_id, 'streak_5') on conflict do nothing;
  end if;
  if v_streak.current_streak >= 10 then
    insert into public.server_milestones (user_id, venue_id, milestone_type)
      values (_user_id, _venue_id, 'streak_10') on conflict do nothing;
  end if;

  select max(spend_per_cover) into v_max_spc from public.server_stats
    where user_id = _user_id and venue_id = _venue_id and week_start < _week_start;
  if v_max_spc is null or v_stat.spend_per_cover > v_max_spc then
    insert into public.server_milestones (user_id, venue_id, milestone_type)
      values (_user_id, _venue_id, 'personal_best') on conflict do nothing;
  end if;

  select percentile_cont(0.75) within group (order by spend_per_cover) into v_top25_threshold
    from public.server_stats where venue_id = _venue_id and week_start = _week_start;
  if v_top25_threshold is not null and v_stat.spend_per_cover >= v_top25_threshold then
    insert into public.server_milestones (user_id, venue_id, milestone_type)
      values (_user_id, _venue_id, 'top_performer') on conflict do nothing;
  end if;
end;
$$;

create or replace function public.process_csv_upload(_venue_id uuid, _week_start date, _csv_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_name text;
  v_user_id uuid;
  v_inserted int := 0;
  v_unmatched text[] := array[]::text[];
begin
  if not exists (select 1 from public.venues where id = _venue_id and manager_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;

  for v_row in select * from jsonb_array_elements(_csv_data)
  loop
    v_name := trim(v_row->>'server_name');
    if v_name is null or v_name = '' then continue; end if;

    select p.id into v_user_id
      from public.profiles p
      join public.venue_members vm on vm.user_id = p.id
      where vm.venue_id = _venue_id
        and lower(trim(p.full_name)) = lower(v_name)
      limit 1;

    if v_user_id is null then
      v_unmatched := array_append(v_unmatched, v_name);
      continue;
    end if;

    insert into public.server_stats
      (venue_id, user_id, week_start, total_covers, total_sales, wine_sales, dessert_sales, cocktail_sales)
      values (
        _venue_id, v_user_id, _week_start,
        coalesce((v_row->>'total_covers')::int, 0),
        coalesce((v_row->>'total_sales')::numeric, 0),
        coalesce((v_row->>'wine_sales')::numeric, 0),
        coalesce((v_row->>'dessert_sales')::numeric, 0),
        coalesce((v_row->>'cocktail_sales')::numeric, 0)
      )
      on conflict (venue_id, user_id, week_start) do update set
        total_covers = excluded.total_covers,
        total_sales = excluded.total_sales,
        wine_sales = excluded.wine_sales,
        dessert_sales = excluded.dessert_sales,
        cocktail_sales = excluded.cocktail_sales;

    insert into public.server_targets (venue_id, user_id)
      values (_venue_id, v_user_id) on conflict do nothing;

    perform public.update_streaks_and_milestones(v_user_id, _venue_id, _week_start);
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'unmatched', to_jsonb(v_unmatched));
end;
$$;