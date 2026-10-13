-- This SECURITY DEFINER function is only intended to run from its table trigger.
-- Pin its search path and prevent direct RPC invocation by API roles.
alter function public.sync_race_community_eligibility()
    set search_path = '';

revoke all on function public.sync_race_community_eligibility()
    from public, anon, authenticated;
