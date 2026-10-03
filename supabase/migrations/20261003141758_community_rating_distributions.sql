-- Aggregate community ratings into half-point buckets for the Results view.
-- The public API returns no individual ratings or user identities.
create function community_private.rating_distributions(p_kind text, p_season text)
returns table (driver_id text, vote_count bigint, rating_distribution jsonb)
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

    if p_kind = 'race' then
        return query
        with eligible as (
            select r.driver_id, r.rating
            from public.user_race_ratings r
            where r.community_eligible
                and r.season = p_season
                and r.rating between 0.5 and 10
                and mod(r.rating, 0.5) = 0
        ), totals as (
            select e.driver_id, count(*)::bigint as vote_count
            from eligible e
            group by e.driver_id
            having count(*) >= 5
        ), buckets as (
            select e.driver_id, e.rating, count(*)::bigint as bucket_count
            from eligible e
            group by e.driver_id, e.rating
        )
        select t.driver_id, t.vote_count,
            jsonb_agg(
                jsonb_build_object('score', score.bucket::numeric / 2, 'count', coalesce(b.bucket_count, 0))
                order by score.bucket
            )
        from totals t
        cross join generate_series(1, 20) as score(bucket)
        left join buckets b on b.driver_id = t.driver_id and b.rating = score.bucket::numeric / 2
        group by t.driver_id, t.vote_count;
    else
        return query
        with eligible as (
            select r.driver_id, r.rating
            from public.user_quick_ratings r
            where r.community_eligible
                and r.season = p_season
                and r.rating between 0.5 and 10
                and mod(r.rating, 0.5) = 0
        ), totals as (
            select e.driver_id, count(*)::bigint as vote_count
            from eligible e
            group by e.driver_id
            having count(*) >= 5
        ), buckets as (
            select e.driver_id, e.rating, count(*)::bigint as bucket_count
            from eligible e
            group by e.driver_id, e.rating
        )
        select t.driver_id, t.vote_count,
            jsonb_agg(
                jsonb_build_object('score', score.bucket::numeric / 2, 'count', coalesce(b.bucket_count, 0))
                order by score.bucket
            )
        from totals t
        cross join generate_series(1, 20) as score(bucket)
        left join buckets b on b.driver_id = t.driver_id and b.rating = score.bucket::numeric / 2
        group by t.driver_id, t.vote_count;
    end if;
end;
$$;

create function public.get_community_rating_distributions(p_kind text, p_season text)
returns table (driver_id text, vote_count bigint, rating_distribution jsonb)
language sql stable security invoker set search_path = ''
as $$
    select * from community_private.rating_distributions(p_kind, p_season);
$$;

revoke all on function community_private.rating_distributions(text, text) from public, anon, authenticated;
revoke all on function public.get_community_rating_distributions(text, text) from public, anon, authenticated;
grant execute on function community_private.rating_distributions(text, text) to authenticated;
grant execute on function public.get_community_rating_distributions(text, text) to authenticated;

comment on function public.get_community_rating_distributions(text, text) is
    'Returns only aggregate half-point rating counts for authenticated guests; results below five eligible votes are withheld.';
