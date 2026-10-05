-- Preserve race boundaries for agreement while retaining all season votes in
-- the histogram. Single-vote races are returned only when the driver's total
-- reaches two votes; they remain unassessed by the agreement calculation.
-- Existing pooled-distribution RPCs remain compatible with older clients.
create function community_private.rating_distributions_by_round(p_kind text, p_season text)
returns table (driver_id text, round text, vote_count bigint, rating_distribution jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_kind is null or p_kind not in ('race', 'quick') then
        raise exception 'Invalid rating source' using errcode = '22023';
    end if;
    if p_season is null or p_season !~ '^[0-9]{4}$' then
        raise exception 'Invalid rating scope' using errcode = '22023';
    end if;

    return query
    with eligible as (
        select r.driver_id, r.round, r.rating
        from public.user_race_ratings r
        where p_kind = 'race' and r.community_eligible and r.season = p_season
            and r.rating between 0.5 and 10 and mod(r.rating, 0.5) = 0
        union all
        select r.driver_id, null::text as round, r.rating
        from public.user_quick_ratings r
        where p_kind = 'quick' and r.community_eligible and r.season = p_season
            and r.rating between 0.5 and 10 and mod(r.rating, 0.5) = 0
    ), drivers as (
        select e.driver_id
        from eligible e
        group by e.driver_id
        having count(*) >= 2
    ), scopes as (
        select e.driver_id, e.round, count(*)::bigint as vote_count
        from eligible e
        join drivers d on d.driver_id = e.driver_id
        group by e.driver_id, e.round
    ), buckets as (
        select e.driver_id, e.round, e.rating, count(*)::bigint as bucket_count
        from eligible e
        join drivers d on d.driver_id = e.driver_id
        group by e.driver_id, e.round, e.rating
    )
    select s.driver_id, s.round, s.vote_count,
        jsonb_agg(
            jsonb_build_object('score', score.bucket::numeric / 2, 'count', coalesce(b.bucket_count, 0))
            order by score.bucket
        )
    from scopes s
    cross join generate_series(1, 20) as score(bucket)
    left join buckets b on b.driver_id = s.driver_id
        and b.round is not distinct from s.round and b.rating = score.bucket::numeric / 2
    group by s.driver_id, s.round, s.vote_count;
end;
$$;

create function public.get_community_rating_distributions_by_round(p_kind text, p_season text)
returns table (driver_id text, round text, vote_count bigint, rating_distribution jsonb)
language sql stable security invoker set search_path = ''
as $$
    select * from community_private.rating_distributions_by_round(p_kind, p_season);
$$;

revoke all on function community_private.rating_distributions_by_round(text, text) from public, anon, authenticated;
revoke all on function public.get_community_rating_distributions_by_round(text, text) from public, anon, authenticated;
grant execute on function community_private.rating_distributions_by_round(text, text) to authenticated;
grant execute on function public.get_community_rating_distributions_by_round(text, text) to authenticated;

comment on function public.get_community_rating_distributions_by_round(text, text) is
    'Aggregate half-point counts per driver and race (null round for Quick Rate). Requires an authenticated guest and at least two total votes per driver; returns no user identities.';
