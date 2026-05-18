
create or replace function public.venue_weekly_leaderboard(p_venue_id uuid, p_week_start date)
returns table (
  user_id uuid,
  full_name text,
  current_sales numeric,
  prev_sales numeric,
  fourwk_avg_sales numeric,
  current_by_category jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from venue_members where venue_id = p_venue_id and user_id = auth.uid()
  ) and not exists (
    select 1 from venues where id = p_venue_id and manager_id = auth.uid()
  ) then
    return;
  end if;

  return query
  with recent as (
    select * from server_category_stats
    where venue_id = p_venue_id
      and week_start <= p_week_start
      and week_start >= (p_week_start - interval '28 days')::date
  ),
  weekly as (
    select user_id, week_start, sum(coalesce(net_sales, sales, 0)) as wk_sales
    from recent
    group by user_id, week_start
  ),
  per_user as (
    select
      w.user_id,
      coalesce(sum(wk_sales) filter (where week_start = p_week_start), 0) as current_sales,
      coalesce(sum(wk_sales) filter (where week_start = (p_week_start - interval '7 days')::date), 0) as prev_sales,
      coalesce(avg(wk_sales) filter (where week_start < p_week_start), 0) as fourwk_avg_sales
    from weekly w
    group by w.user_id
  ),
  per_cat as (
    select
      r.user_id,
      jsonb_object_agg(
        r.category_key,
        jsonb_build_object(
          'sales', coalesce(r.net_sales, r.sales, 0),
          'conversion', r.conversion,
          'quantity', r.quantity
        )
      ) as current_by_category
    from recent r
    where r.week_start = p_week_start
    group by r.user_id
  )
  select
    pu.user_id,
    p.full_name,
    pu.current_sales,
    pu.prev_sales,
    pu.fourwk_avg_sales,
    pc.current_by_category
  from per_user pu
  left join profiles p on p.id = pu.user_id
  left join per_cat pc on pc.user_id = pu.user_id;
end;
$$;

grant execute on function public.venue_weekly_leaderboard(uuid, date) to authenticated;
