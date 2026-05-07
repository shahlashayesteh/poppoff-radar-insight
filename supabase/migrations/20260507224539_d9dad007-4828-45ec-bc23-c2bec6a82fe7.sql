create or replace function public.calculate_performance_colour(actual numeric, target numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when target is null or target = 0 then 'amber'
    when actual >= target then 'green'
    when actual >= target * 0.8 then 'amber'
    else 'red'
  end;
$$;