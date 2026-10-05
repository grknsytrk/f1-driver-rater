-- Run inside BEGIN / ROLLBACK after installing community_rating_agreement.
-- Fixture identities and votes must never persist.
create temporary table agreement_test_users as
select gen_random_uuid() as a, gen_random_uuid() as b, gen_random_uuid() as c;
grant select on agreement_test_users to authenticated;

insert into auth.users (id, aud, role, is_anonymous)
select a, 'authenticated', 'authenticated', true from agreement_test_users
union all select b, 'authenticated', 'authenticated', true from agreement_test_users
union all select c, 'authenticated', 'authenticated', true from agreement_test_users;

insert into public.user_race_ratings
    (user_id, season, round, race_name, race_date, driver_id, driver_name, constructor_id, constructor_name, rating, community_eligible)
select a, '2097', '1', 'Agreement GP', '2097-01-01', 'agreement_test_driver', 'Test Driver', 'test', 'Test', 8, true from agreement_test_users
union all select b, '2097', '1', 'Agreement GP', '2097-01-01', 'agreement_test_driver', 'Test Driver', 'test', 'Test', 8.5, true from agreement_test_users
union all select a, '2097', '2', 'Agreement GP 2', '2097-02-01', 'agreement_test_driver', 'Test Driver', 'test', 'Test', 3, true from agreement_test_users
union all select b, '2097', '2', 'Agreement GP 2', '2097-02-01', 'agreement_test_driver', 'Test Driver', 'test', 'Test', 3, true from agreement_test_users
union all select c, '2097', '3', 'Single-vote GP', '2097-03-01', 'agreement_test_driver', 'Test Driver', 'test', 'Test', 9, true from agreement_test_users
union all select a, '2097', '4', 'Legacy GP', '2097-04-01', 'agreement_test_driver', 'Test Driver', 'test', 'Test', 0, false from agreement_test_users
union all select a, '2097', '1', 'Agreement GP', '2097-01-01', 'agreement_test_single', 'Single Driver', 'test', 'Test', 5, true from agreement_test_users
union all select a, '2097', '1', 'Agreement GP', '2097-01-01', 'agreement_test_across_races', 'Across Races', 'test', 'Test', 4, true from agreement_test_users
union all select b, '2097', '2', 'Agreement GP 2', '2097-02-01', 'agreement_test_across_races', 'Across Races', 'test', 'Test', 9, true from agreement_test_users;

insert into public.user_quick_ratings
    (user_id, season, driver_id, driver_name, constructor_id, constructor_name, rating, community_eligible)
select a, '2097', 'agreement_test_driver', 'Test Driver', 'test', 'Test', 3, true from agreement_test_users
union all select b, '2097', 'agreement_test_driver', 'Test Driver', 'test', 'Test', 9, true from agreement_test_users
union all select c, '2097', 'agreement_test_single', 'Single Driver', 'test', 'Test', 5, true from agreement_test_users;

do $$ begin
    assert not has_function_privilege('anon', 'public.get_community_rating_distributions_by_round(text,text)', 'EXECUTE');
    assert not has_function_privilege('anon', 'community_private.rating_distributions_by_round(text,text)', 'EXECUTE');
    assert has_function_privilege('authenticated', 'public.get_community_rating_distributions_by_round(text,text)', 'EXECUTE');
    assert not has_table_privilege('anon', 'public.user_race_ratings', 'SELECT');
    assert (select relrowsecurity from pg_class where oid = 'public.user_race_ratings'::regclass);
    assert (select relrowsecurity from pg_class where oid = 'public.user_quick_ratings'::regclass);
end $$;

select set_config('request.jwt.claim.sub', (select a::text from agreement_test_users), true);
set local role authenticated;
do $$
declare result record; fields text[];
begin
    assert not exists (select 1 from public.user_race_ratings where user_id <> auth.uid()), 'Raw race RLS leaked another guest';
    assert not exists (select 1 from public.user_quick_ratings where user_id <> auth.uid()), 'Raw Quick Rate RLS leaked another guest';

    select * into strict result from public.get_community_rating_distributions_by_round('race', '2097')
        where driver_id = 'agreement_test_driver' and round = '1';
    assert result.vote_count = 2, 'The new distribution must work with two votes';
    assert jsonb_array_length(result.rating_distribution) = 20, 'Missing half-point buckets';
    assert (select sum((bucket->>'count')::bigint) from jsonb_array_elements(result.rating_distribution) bucket) = 2,
        'Race bucket counts do not match the vote count';
    assert (result.rating_distribution->15->>'count')::bigint = 1
        and (result.rating_distribution->16->>'count')::bigint = 1, 'Race scores were mixed or lost';
    select array_agg(k order by k) into fields from jsonb_object_keys(to_jsonb(result)) k;
    assert fields = array['driver_id','rating_distribution','round','vote_count'], 'RPC exposed unexpected fields';

    select * into strict result from public.get_community_rating_distributions_by_round('race', '2097')
        where driver_id = 'agreement_test_driver' and round = '2';
    assert result.vote_count = 2 and (result.rating_distribution->5->>'count')::bigint = 2,
        'Different races were pooled';
    select * into strict result from public.get_community_rating_distributions_by_round('race', '2097')
        where driver_id = 'agreement_test_driver' and round = '3';
    assert result.vote_count = 1 and (result.rating_distribution->17->>'count')::bigint = 1,
        'A single-vote race must remain available for the season histogram';
    assert not exists (select 1 from public.get_community_rating_distributions_by_round('race', '2097')
        where driver_id = 'agreement_test_driver' and round = '4'), 'Ineligible votes were included';
    assert not exists (select 1 from public.get_community_rating_distributions_by_round('race', '2097')
        where driver_id = 'agreement_test_single'), 'One total vote exposed a distribution';
    assert (select count(*) from public.get_community_rating_distributions_by_round('race', '2097')
        where driver_id = 'agreement_test_across_races' and vote_count = 1) = 2,
        'Single votes across races lost their race boundaries';
    assert not exists (select 1 from public.get_community_rating_distributions_by_round('race', '2098')
        where driver_id = 'agreement_test_driver'), 'Season scope was ignored';

    select * into strict result from public.get_community_rating_distributions_by_round('quick', '2097')
        where driver_id = 'agreement_test_driver';
    assert result.round is null and result.vote_count = 2, 'Quick Rate received a race timeline';
    assert (result.rating_distribution->5->>'count')::bigint = 1
        and (result.rating_distribution->17->>'count')::bigint = 1, 'Quick Rate mixed with race votes';
    assert not exists (select 1 from public.get_community_rating_distributions_by_round('quick', '2097')
        where driver_id = 'agreement_test_single'), 'Quick Rate below two votes exposed a distribution';

    begin
        perform public.get_community_rating_distributions_by_round('unknown', '2097');
        raise exception 'Invalid source was accepted';
    exception when sqlstate '22023' then null;
    end;
    begin
        perform public.get_community_rating_distributions_by_round('race', 'invalid');
        raise exception 'Invalid season was accepted';
    exception when sqlstate '22023' then null;
    end;
end $$;

select set_config('request.jwt.claim.sub', '', true);
do $$ begin
    begin
        perform public.get_community_rating_distributions_by_round('race', '2097');
        raise exception 'A missing identity was accepted';
    exception when insufficient_privilege then null;
    end;
end $$;
reset role;
