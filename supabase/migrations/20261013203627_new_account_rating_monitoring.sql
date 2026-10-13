-- New accounts created after rollout have a 24-hour community-rating hold.
-- Existing accounts are grandfathered in using enabled_since.
create table if not exists community_private.community_rating_monitoring (
    singleton boolean primary key default true check (singleton),
    enabled_since timestamptz not null default statement_timestamp()
);

alter table community_private.community_rating_monitoring enable row level security;
revoke all on table community_private.community_rating_monitoring from public, anon, authenticated;

insert into community_private.community_rating_monitoring (singleton)
values (true)
on conflict (singleton) do nothing;

comment on table community_private.community_rating_monitoring is
    'Private rollout timestamp for the new-account community-rating monitoring period.';

create or replace function community_private.current_user_community_rating_monitoring_until()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := (select auth.uid());
    account_created_at timestamptz;
    monitoring_enabled_since timestamptz;
begin
    if current_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    select u.created_at, m.enabled_since
    into account_created_at, monitoring_enabled_since
    from auth.users u
    cross join community_private.community_rating_monitoring m
    where u.id = current_user_id;

    if not found then
        return null;
    end if;

    if account_created_at >= monitoring_enabled_since
        and account_created_at + interval '24 hours' > statement_timestamp() then
        return account_created_at + interval '24 hours';
    end if;

    return null;
end;
$$;

revoke all on function community_private.current_user_community_rating_monitoring_until() from public, anon, authenticated;
grant usage on schema community_private to authenticated;
grant execute on function community_private.current_user_community_rating_monitoring_until() to authenticated;

create or replace function public.get_community_rating_monitoring_until()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
    select community_private.current_user_community_rating_monitoring_until();
$$;

revoke all on function public.get_community_rating_monitoring_until() from public, anon, authenticated;
grant execute on function public.get_community_rating_monitoring_until() to authenticated;

comment on function public.get_community_rating_monitoring_until() is
    'Returns the current authenticated user’s monitoring end time only while their new-account rating hold is active.';

-- The community tables may retain an eligible flag during the hold so ratings
-- become countable automatically at expiry. Every aggregate endpoint filters
-- new accounts here, while existing accounts remain unaffected.
create or replace function community_private.race_averages(p_season text, p_round text)
returns table (round text, driver_id text, average_rating numeric, vote_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_season is null or p_season !~ '^[0-9]{4}$'
        or (p_round is not null and p_round !~ '^[1-9][0-9]{0,2}$') then
        raise exception 'Invalid rating scope' using errcode = '22023';
    end if;
    return query
        select r.round, r.driver_id, avg(r.rating), count(*)
        from public.user_race_ratings r
        join auth.users u on u.id = r.user_id
        cross join community_private.community_rating_monitoring m
        where r.community_eligible and r.season = p_season
            and (p_round is null or r.round = p_round)
            and (u.created_at < m.enabled_since
                or u.created_at <= statement_timestamp() - interval '24 hours')
            and r.rating between 0.5 and 10 and mod(r.rating, 0.5) = 0
        group by r.round, r.driver_id;
end;
$$;

create or replace function community_private.quick_averages(p_season text)
returns table (driver_id text, average_rating numeric, vote_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_season is null or p_season !~ '^[0-9]{4}$' then
        raise exception 'Invalid rating scope' using errcode = '22023';
    end if;
    return query
        select r.driver_id, avg(r.rating), count(*)
        from public.user_quick_ratings r
        join auth.users u on u.id = r.user_id
        cross join community_private.community_rating_monitoring m
        where r.community_eligible and r.season = p_season
            and (u.created_at < m.enabled_since
                or u.created_at <= statement_timestamp() - interval '24 hours')
            and r.rating between 0.5 and 10 and mod(r.rating, 0.5) = 0
        group by r.driver_id;
end;
$$;

create or replace function community_private.rating_distributions(p_kind text, p_season text)
returns table (driver_id text, vote_count bigint, rating_distribution jsonb)
language plpgsql
stable
security definer
set search_path = ''
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
            join auth.users u on u.id = r.user_id
            cross join community_private.community_rating_monitoring m
            where r.community_eligible
                and r.season = p_season
                and (u.created_at < m.enabled_since
                    or u.created_at <= statement_timestamp() - interval '24 hours')
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
            join auth.users u on u.id = r.user_id
            cross join community_private.community_rating_monitoring m
            where r.community_eligible
                and r.season = p_season
                and (u.created_at < m.enabled_since
                    or u.created_at <= statement_timestamp() - interval '24 hours')
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

create or replace function community_private.rating_distributions_by_round(p_kind text, p_season text)
returns table (driver_id text, round text, vote_count bigint, rating_distribution jsonb)
language plpgsql
stable
security definer
set search_path = ''
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
        join auth.users u on u.id = r.user_id
        cross join community_private.community_rating_monitoring m
        where p_kind = 'race' and r.community_eligible and r.season = p_season
            and (u.created_at < m.enabled_since
                or u.created_at <= statement_timestamp() - interval '24 hours')
            and r.rating between 0.5 and 10 and mod(r.rating, 0.5) = 0
        union all
        select r.driver_id, null::text as round, r.rating
        from public.user_quick_ratings r
        join auth.users u on u.id = r.user_id
        cross join community_private.community_rating_monitoring m
        where p_kind = 'quick' and r.community_eligible and r.season = p_season
            and (u.created_at < m.enabled_since
                or u.created_at <= statement_timestamp() - interval '24 hours')
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
