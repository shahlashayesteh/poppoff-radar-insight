
-- Loosen FKs so we can create placeholder server profiles without an auth user
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.venue_members DROP CONSTRAINT IF EXISTS venue_members_user_id_fkey;

-- Recreate handle_new_user (still inserts profile on signup; safe with no FK)
-- (no change needed; trigger continues to insert into profiles)

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
  v_created int := 0;
  v_unmatched text[] := array[]::text[];
begin
  if not exists (select 1 from public.venues where id = _venue_id and manager_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;

  for v_row in select * from jsonb_array_elements(_csv_data)
  loop
    v_name := trim(v_row->>'server_name');
    if v_name is null or v_name = '' then continue; end if;

    -- Try to find an existing member of this venue by name (case-insensitive)
    select p.id into v_user_id
      from public.profiles p
      join public.venue_members vm on vm.user_id = p.id
      where vm.venue_id = _venue_id
        and lower(trim(p.full_name)) = lower(v_name)
      limit 1;

    -- If not found, create a placeholder profile + venue_member so stats can be tracked
    if v_user_id is null then
      v_user_id := gen_random_uuid();
      insert into public.profiles (id, full_name) values (v_user_id, v_name);
      insert into public.venue_members (venue_id, user_id) values (_venue_id, v_user_id);
      v_created := v_created + 1;
      v_unmatched := array_append(v_unmatched, v_name);
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

    insert into public.server_streaks (venue_id, user_id, current_streak, longest_streak)
      values (_venue_id, v_user_id, 0, 0) on conflict do nothing;

    perform public.update_streaks_and_milestones(v_user_id, _venue_id, _week_start);
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'matched_count', v_inserted,
    'created_count', v_created,
    'unmatched_names', to_jsonb(v_unmatched),
    'success', true
  );
end;
$function$;
