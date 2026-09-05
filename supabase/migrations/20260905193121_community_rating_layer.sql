-- Historical ratings remain personal until explicitly selected again.
alter table public.user_race_ratings
    add column community_eligible boolean not null default false;
alter table public.user_quick_ratings
    add column community_eligible boolean not null default false;

alter table public.user_race_ratings add constraint race_community_rating_valid
    check (not community_eligible or (rating between 0.5 and 10 and mod(rating, 0.5) = 0));
alter table public.user_quick_ratings add constraint quick_community_rating_valid
    check (not community_eligible or (rating between 0.5 and 10 and mod(rating, 0.5) = 0));

create index user_race_ratings_community_idx on public.user_race_ratings (season, round, driver_id)
    include (rating) where community_eligible;
create index user_quick_ratings_community_idx on public.user_quick_ratings (season, driver_id)
    include (rating) where community_eligible;

-- Never add this schema to PostgREST's exposed schemas.
create schema community_private;
revoke all on schema community_private from public, anon, authenticated;
grant usage on schema community_private to authenticated;

create function community_private.race_averages(p_season text, p_round text)
returns table (round text, driver_id text, average_rating numeric, vote_count bigint)
language plpgsql stable security definer set search_path = ''
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
        where r.community_eligible and r.season = p_season
            and (p_round is null or r.round = p_round)
            and r.rating between 0.5 and 10 and mod(r.rating, 0.5) = 0
        group by r.round, r.driver_id;
end;
$$;

create function community_private.quick_averages(p_season text)
returns table (driver_id text, average_rating numeric, vote_count bigint)
language plpgsql stable security definer set search_path = ''
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
        where r.community_eligible and r.season = p_season
            and r.rating between 0.5 and 10 and mod(r.rating, 0.5) = 0
        group by r.driver_id;
end;
$$;

create function public.get_race_community_ratings(p_season text, p_round text default null)
returns table (round text, driver_id text, average_rating numeric, vote_count bigint)
language sql stable security invoker set search_path = ''
as $$ select * from community_private.race_averages(p_season, p_round); $$;

create function public.get_quick_community_ratings(p_season text)
returns table (driver_id text, average_rating numeric, vote_count bigint)
language sql stable security invoker set search_path = ''
as $$ select * from community_private.quick_averages(p_season); $$;

revoke all on function community_private.race_averages(text, text) from public, anon, authenticated;
revoke all on function community_private.quick_averages(text) from public, anon, authenticated;
revoke all on function public.get_race_community_ratings(text, text) from public, anon, authenticated;
revoke all on function public.get_quick_community_ratings(text) from public, anon, authenticated;
grant execute on function community_private.race_averages(text, text) to authenticated;
grant execute on function community_private.quick_averages(text) to authenticated;
grant execute on function public.get_race_community_ratings(text, text) to authenticated;
grant execute on function public.get_quick_community_ratings(text) to authenticated;

comment on function public.get_race_community_ratings(text, text) is
    'Explicit guest votes only. One vote already produces an average. No individual rows or identities returned.';
comment on function public.get_quick_community_ratings(text) is
    'Season Quick Rate votes only; never mixed with race ratings.';
