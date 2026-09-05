-- Run inside BEGIN/ROLLBACK, with the migration already installed.
-- All identities and ratings are disposable transactional fixtures.
create temporary table community_test_users as select gen_random_uuid() as a, gen_random_uuid() as b;
grant select on community_test_users to authenticated;
insert into auth.users (id, aud, role, is_anonymous)
select a, 'authenticated', 'authenticated', true from community_test_users
union all select b, 'authenticated', 'authenticated', true from community_test_users;

insert into public.user_race_ratings
    (user_id, season, round, race_name, race_date, driver_id, driver_name, constructor_id, constructor_name, rating, community_eligible)
select a, '2099', '1', 'Test GP', '2099-01-01', 'community_test_driver', 'Test Driver', 'test', 'Test', 8, true from community_test_users
union all select b, '2099', '1', 'Test GP', '2099-01-01', 'community_test_driver', 'Test Driver', 'test', 'Test', 6, true from community_test_users
union all select a, '2099', '2', 'Test GP 2', '2099-02-01', 'community_test_driver', 'Test Driver', 'test', 'Test', 4, true from community_test_users
union all select a, '2099', '1', 'Test GP', '2099-01-01', 'community_test_legacy', 'Legacy', 'test', 'Test', 5, false from community_test_users;
insert into public.user_quick_ratings
    (user_id, season, driver_id, driver_name, constructor_id, constructor_name, rating, community_eligible)
select a, '2099', 'community_test_driver', 'Test Driver', 'test', 'Test', 3, true from community_test_users
union all select b, '2099', 'community_test_driver', 'Test Driver', 'test', 'Test', 9, true from community_test_users;

do $$ begin
    assert not has_function_privilege('anon', 'public.get_race_community_ratings(text,text)', 'EXECUTE');
    assert not has_function_privilege('anon', 'public.get_quick_community_ratings(text)', 'EXECUTE');
    assert not has_function_privilege('anon', 'community_private.race_averages(text,text)', 'EXECUTE');
    assert not has_table_privilege('anon', 'public.user_race_ratings', 'SELECT');
    assert not has_table_privilege('anon', 'public.user_quick_ratings', 'SELECT');
    assert (select relrowsecurity from pg_class where oid = 'public.user_race_ratings'::regclass);
    assert (select relrowsecurity from pg_class where oid = 'public.user_quick_ratings'::regclass);
end $$;

select set_config('request.jwt.claim.sub', (select a::text from community_test_users), true);
set local role authenticated;
do $$
declare result record; fields text[];
begin
    assert not exists (select 1 from public.user_race_ratings where user_id <> auth.uid()), 'Race RLS leaked another guest';
    assert not exists (select 1 from public.user_quick_ratings where user_id <> auth.uid()), 'Quick RLS leaked another guest';
    select * into strict result from public.get_race_community_ratings('2099', '1') where driver_id = 'community_test_driver';
    assert result.vote_count = 2 and result.average_rating = 7, 'Race aggregate mismatch';
    select array_agg(k order by k) into fields from jsonb_object_keys(to_jsonb(result)) k;
    assert fields = array['average_rating','driver_id','round','vote_count'], 'Unexpected RPC field';
    assert not exists (select 1 from public.get_race_community_ratings('2099', '1') where driver_id = 'community_test_legacy');
    select * into strict result from public.get_race_community_ratings('2099', '2') where driver_id = 'community_test_driver';
    assert result.vote_count = 1 and result.average_rating = 4, 'A single vote must be visible';
    assert (select count(*) from public.get_race_community_ratings('2099') where driver_id = 'community_test_driver') = 2;
    assert not exists (select 1 from public.get_race_community_ratings('2098') where driver_id = 'community_test_driver');
    select * into strict result from public.get_quick_community_ratings('2099') where driver_id = 'community_test_driver';
    assert result.vote_count = 2 and result.average_rating = 6, 'Quick/race data were mixed';
    begin
        insert into public.user_quick_ratings (user_id, season, driver_id, driver_name, constructor_id, constructor_name, rating)
        select b, '2099', 'forbidden', 'Forbidden', 'test', 'Test', 5 from community_test_users;
        raise exception 'Cross-guest insert was allowed';
    exception when insufficient_privilege then null;
    end;
    begin
        update public.user_race_ratings set community_eligible = true, rating = 0
        where driver_id = 'community_test_legacy' and season = '2099';
        raise exception 'Zero was accepted as a community vote';
    exception when check_violation then null;
    end;
    update public.user_race_ratings set rating = 10 where season = '2099' and round = '1' and driver_id = 'community_test_driver';
    select * into strict result from public.get_race_community_ratings('2099', '1') where driver_id = 'community_test_driver';
    assert result.vote_count = 2 and result.average_rating = 8, 'Editing added a vote';
    delete from public.user_race_ratings where season = '2099' and round = '1' and driver_id = 'community_test_driver';
    select * into strict result from public.get_race_community_ratings('2099', '1') where driver_id = 'community_test_driver';
    assert result.vote_count = 1 and result.average_rating = 6, 'Deletion did not remove vote';
end $$;

reset role;
select set_config('request.jwt.claim.sub', (select b::text from community_test_users), true);
set local role authenticated;
do $$ begin
    assert not exists (select 1 from public.user_race_ratings where user_id <> auth.uid());
    assert not exists (select 1 from public.user_quick_ratings where user_id <> auth.uid());
    assert exists (select 1 from public.get_race_community_ratings('2099', '2') where driver_id = 'community_test_driver' and average_rating = 4);
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
    begin
        perform public.get_race_community_ratings('2099', '1');
        raise exception 'Missing identity was allowed';
    exception when insufficient_privilege then null;
    end;
end $$;
reset role;
