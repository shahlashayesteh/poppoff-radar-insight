
-- server_stats: new sales columns + generated conversions
ALTER TABLE public.server_stats
  ADD COLUMN IF NOT EXISTS sides_sales numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spirits_sales numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sparkling_sales numeric NOT NULL DEFAULT 0;

-- Drop and re-add generated conversion columns to ensure consistency
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='server_stats' AND column_name='sides_conversion') THEN
    ALTER TABLE public.server_stats ADD COLUMN sides_conversion numeric GENERATED ALWAYS AS (CASE WHEN total_sales > 0 THEN sides_sales / total_sales * 100 ELSE 0 END) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='server_stats' AND column_name='spirits_conversion') THEN
    ALTER TABLE public.server_stats ADD COLUMN spirits_conversion numeric GENERATED ALWAYS AS (CASE WHEN total_sales > 0 THEN spirits_sales / total_sales * 100 ELSE 0 END) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='server_stats' AND column_name='sparkling_conversion') THEN
    ALTER TABLE public.server_stats ADD COLUMN sparkling_conversion numeric GENERATED ALWAYS AS (CASE WHEN total_sales > 0 THEN sparkling_sales / total_sales * 100 ELSE 0 END) STORED;
  END IF;
END $$;

-- Unique constraint for csv upserts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'server_stats_venue_user_week_key'
  ) THEN
    ALTER TABLE public.server_stats ADD CONSTRAINT server_stats_venue_user_week_key UNIQUE (venue_id, user_id, week_start);
  END IF;
END $$;

-- server_targets: extra targets
ALTER TABLE public.server_targets
  ADD COLUMN IF NOT EXISTS sides_target numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS spirits_target numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS sparkling_target numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS daily_sales_target numeric NOT NULL DEFAULT 200;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'server_targets_venue_user_key') THEN
    ALTER TABLE public.server_targets ADD CONSTRAINT server_targets_venue_user_key UNIQUE (venue_id, user_id);
  END IF;
END $$;

-- streaks unique
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='server_streaks_user_venue_key') THEN
    ALTER TABLE public.server_streaks ADD CONSTRAINT server_streaks_user_venue_key UNIQUE(user_id, venue_id);
  END IF;
END $$;

-- milestones unique
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='server_milestones_user_venue_type_key') THEN
    ALTER TABLE public.server_milestones ADD CONSTRAINT server_milestones_user_venue_type_key UNIQUE(user_id, venue_id, milestone_type);
  END IF;
END $$;

-- venue_menu extras
ALTER TABLE public.venue_menu
  ADD COLUMN IF NOT EXISTS parsed_items jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- venue_settings
CREATE TABLE IF NOT EXISTS public.venue_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
  cuisine text,
  cover_capacity integer,
  green_threshold numeric NOT NULL DEFAULT 80,
  amber_threshold numeric NOT NULL DEFAULT 55,
  servers_see_percentages_only boolean NOT NULL DEFAULT true,
  managers_see_estimated_uplift boolean NOT NULL DEFAULT true,
  head_office_aggregated_only boolean NOT NULL DEFAULT true,
  send_weekly_push_notifications boolean NOT NULL DEFAULT true,
  allow_assistant_manager_priorities boolean NOT NULL DEFAULT false,
  premium_mains_on boolean NOT NULL DEFAULT true,
  bottled_water_on boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.venue_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers manage venue settings" ON public.venue_settings;
CREATE POLICY "Managers manage venue settings" ON public.venue_settings
  FOR ALL USING (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.manager_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.manager_id = auth.uid()));
DROP POLICY IF EXISTS "Servers read venue settings" ON public.venue_settings;
CREATE POLICY "Servers read venue settings" ON public.venue_settings
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.venue_members vm WHERE vm.venue_id = venue_settings.venue_id AND vm.user_id = auth.uid()));

-- weekly_priorities
CREATE TABLE IF NOT EXISTS public.weekly_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  item_name text NOT NULL,
  category text,
  priority_flag text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_weekly_priorities_venue_week ON public.weekly_priorities(venue_id, week_start);
ALTER TABLE public.weekly_priorities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers manage weekly priorities" ON public.weekly_priorities;
CREATE POLICY "Managers manage weekly priorities" ON public.weekly_priorities
  FOR ALL USING (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.manager_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.manager_id = auth.uid()));
DROP POLICY IF EXISTS "Servers read weekly priorities" ON public.weekly_priorities;
CREATE POLICY "Servers read weekly priorities" ON public.weekly_priorities
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.venue_members vm WHERE vm.venue_id = weekly_priorities.venue_id AND vm.user_id = auth.uid()));

-- server_stat_views
CREATE TABLE IF NOT EXISTS public.server_stat_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id, week_start)
);
ALTER TABLE public.server_stat_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Servers insert own views" ON public.server_stat_views;
CREATE POLICY "Servers insert own views" ON public.server_stat_views
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Servers read own views" ON public.server_stat_views;
CREATE POLICY "Servers read own views" ON public.server_stat_views
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Managers read venue views" ON public.server_stat_views;
CREATE POLICY "Managers read venue views" ON public.server_stat_views
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.manager_id = auth.uid()));

-- server_focus_acks
CREATE TABLE IF NOT EXISTS public.server_focus_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_id, week_start)
);
ALTER TABLE public.server_focus_acks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Servers insert own acks" ON public.server_focus_acks;
CREATE POLICY "Servers insert own acks" ON public.server_focus_acks
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Servers read own acks" ON public.server_focus_acks;
CREATE POLICY "Servers read own acks" ON public.server_focus_acks
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Managers read venue acks" ON public.server_focus_acks;
CREATE POLICY "Managers read venue acks" ON public.server_focus_acks
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.manager_id = auth.uid()));

-- Update process_csv_upload to handle new columns
CREATE OR REPLACE FUNCTION public.process_csv_upload(_venue_id uuid, _week_start date, _csv_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      (venue_id, user_id, week_start, total_covers, total_sales, wine_sales, dessert_sales, cocktail_sales, sides_sales, spirits_sales, sparkling_sales)
      values (
        _venue_id, v_user_id, _week_start,
        coalesce((v_row->>'total_covers')::int, 0),
        coalesce((v_row->>'total_sales')::numeric, 0),
        coalesce((v_row->>'wine_sales')::numeric, 0),
        coalesce((v_row->>'dessert_sales')::numeric, 0),
        coalesce((v_row->>'cocktail_sales')::numeric, 0),
        coalesce((v_row->>'sides_sales')::numeric, 0),
        coalesce((v_row->>'spirits_sales')::numeric, 0),
        coalesce((v_row->>'sparkling_sales')::numeric, 0)
      )
      on conflict (venue_id, user_id, week_start) do update set
        total_covers = excluded.total_covers,
        total_sales = excluded.total_sales,
        wine_sales = excluded.wine_sales,
        dessert_sales = excluded.dessert_sales,
        cocktail_sales = excluded.cocktail_sales,
        sides_sales = excluded.sides_sales,
        spirits_sales = excluded.spirits_sales,
        sparkling_sales = excluded.sparkling_sales;

    insert into public.server_targets (venue_id, user_id)
      values (_venue_id, v_user_id) on conflict do nothing;

    perform public.update_streaks_and_milestones(v_user_id, _venue_id, _week_start);
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('matched_count', v_inserted, 'unmatched_names', to_jsonb(v_unmatched), 'success', true);
end;
$function$;
