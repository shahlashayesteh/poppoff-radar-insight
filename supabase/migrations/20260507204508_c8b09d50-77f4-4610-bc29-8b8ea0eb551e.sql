
-- Drop duplicate join_code trigger if it exists
drop trigger if exists set_venue_join_code_trigger on public.venues;

-- Webhook-callable manager claim (service role uses this as fallback)
create or replace function public.claim_manager_account_for(_user_id uuid, _business_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_venue_id uuid; v_name text;
begin
  if _user_id is null then
    raise exception 'user_id required';
  end if;

  -- Block if user is already a server
  if exists (select 1 from public.user_roles where user_id = _user_id and role = 'server') then
    raise exception 'Server accounts cannot become managers';
  end if;

  insert into public.user_roles(user_id, role) values (_user_id, 'manager')
    on conflict (user_id, role) do nothing;

  select id into v_venue_id from public.venues where manager_id = _user_id order by created_at limit 1;
  if v_venue_id is not null then
    return v_venue_id;
  end if;

  v_name := nullif(trim(_business_name), '');
  if v_name is null then
    select nullif(trim(business_name), '') into v_name from public.profiles where id = _user_id;
  end if;
  if v_name is null then
    v_name := 'My Venue';
  end if;

  insert into public.venues(manager_id, name) values (_user_id, v_name) returning id into v_venue_id;
  return v_venue_id;
end; $$;

-- Subscription helper (used by Settings, future gating)
create or replace function public.has_active_subscription(user_uuid uuid, check_env text default 'live')
returns boolean language sql security definer set search_path = public as $$
  select exists(
    select 1 from public.subscriptions
    where user_id = user_uuid and environment = check_env
    and ((status in ('active','trialing') and (current_period_end is null or current_period_end > now()))
      or (status = 'canceled' and current_period_end > now()))
  );
$$;
