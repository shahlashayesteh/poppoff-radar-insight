CREATE OR REPLACE FUNCTION public.update_streaks_and_milestones(_user_id uuid, _venue_id uuid, _week_start date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stat public.server_stats%rowtype;
  v_target public.server_targets%rowtype;
  v_hit boolean := false;
  v_streak public.server_streaks%rowtype;
  v_new_current integer := 0;
  v_new_longest integer := 0;
  v_max_spc numeric;
  v_top25_threshold numeric;
  v_dyn_count int := 0;
  v_miss_count int := 0;
begin
  select * into v_stat from public.server_stats
    where user_id = _user_id and venue_id = _venue_id and week_start = _week_start;
  if not found then return; end if;

  select * into v_target from public.server_targets
    where user_id = _user_id and venue_id = _venue_id;

  select count(*) into v_dyn_count from public.server_category_stats
    where user_id = _user_id and venue_id = _venue_id and week_start = _week_start;

  if v_dyn_count > 0 then
    -- Dynamic-category mode: pass if every tracked category meets its target.
    -- Categories without a target row are treated as hit (don't punish unset targets).
    select count(*) into v_miss_count
    from public.server_category_stats s
    left join public.server_category_targets t
      on t.venue_id = s.venue_id and t.user_id = s.user_id and t.category_key = s.category_key
    where s.user_id = _user_id and s.venue_id = _venue_id and s.week_start = _week_start
      and t.target is not null and t.target > 0
      and coalesce(
            case when coalesce(s.metric_type, 'sales') = 'quantity' then s.quantity
                 else s.conversion end,
            0) < t.target;
    v_hit := (v_miss_count = 0)
         and (v_target.spend_per_cover_target is null
              or coalesce(v_stat.spend_per_cover, 0) >= v_target.spend_per_cover_target);
  else
    -- Legacy mode (no dynamic rows for this week)
    if found then
      v_hit := coalesce(v_stat.spend_per_cover,0) >= v_target.spend_per_cover_target
           and coalesce(v_stat.wine_conversion,0) >= v_target.wine_target
           and coalesce(v_stat.dessert_conversion,0) >= v_target.dessert_target
           and coalesce(v_stat.cocktail_conversion,0) >= v_target.cocktail_target;
    end if;
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
      update public.server_streaks set current_streak = 0 where id = v_streak.id;
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
$function$;