
-- Only service_role should call this (webhook fallback)
revoke execute on function public.claim_manager_account_for(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_manager_account_for(uuid, text) to service_role;

-- Subscription check should be callable by signed-in users only
revoke execute on function public.has_active_subscription(uuid, text) from public, anon;
grant execute on function public.has_active_subscription(uuid, text) to authenticated, service_role;
