-- Run inside BEGIN / ROLLBACK after installing site_policy_acceptance.
-- Fixture identities and votes must never persist.
begin;

create temporary table policy_test_users as
select gen_random_uuid() as a, gen_random_uuid() as b;
grant select on policy_test_users to authenticated;

insert into auth.users (id, aud, role, is_anonymous)
select a, 'authenticated', 'authenticated', true from policy_test_users
union all select b, 'authenticated', 'authenticated', true from policy_test_users;

insert into public.user_race_ratings
    (user_id, season, round, race_name, race_date, driver_id, driver_name, constructor_id, constructor_name, rating, community_eligible)
select a, '2098', '1', 'Policy Test GP', '2098-01-01', 'policy_existing', 'Existing Driver', 'test', 'Test', 8, true
from policy_test_users;

insert into public.user_quick_ratings
    (user_id, season, driver_id, driver_name, constructor_id, constructor_name, rating, community_eligible)
select a, '2098', 'policy_existing', 'Existing Driver', 'test', 'Test', 7, true
from policy_test_users;

select set_config('request.jwt.claim.sub', (select a::text from policy_test_users), true);
set local role authenticated;

do $$
begin
    assert (select count(*) from public.user_race_ratings where driver_id = 'policy_existing') = 1,
        'Existing race ratings must remain readable before acceptance';
    assert (select rating from public.user_race_ratings where driver_id = 'policy_existing') = 8,
        'Existing race rating changed before acceptance';
    assert (select count(*) from public.user_quick_ratings where driver_id = 'policy_existing') = 1,
        'Existing Quick Rate ratings must remain readable before acceptance';
    assert (select rating from public.user_quick_ratings where driver_id = 'policy_existing') = 7,
        'Existing Quick Rate rating changed before acceptance';
    assert not (select community_eligible from public.user_quick_ratings where driver_id = 'policy_existing'),
        'Existing Quick Rate eligibility changed before acceptance';

    begin
        insert into public.user_race_ratings
            (user_id, season, round, race_name, race_date, driver_id, driver_name, constructor_id, constructor_name, rating)
        select auth.uid(), '2098', '1', 'Policy Test GP', '2098-01-01', 'policy_new', 'New Driver', 'test', 'Test', 9;
        raise exception 'An unaccepted account inserted a race rating';
    exception when insufficient_privilege then null;
    end;

    begin
        insert into public.user_quick_ratings
            (user_id, season, driver_id, driver_name, constructor_id, constructor_name, rating)
        values (auth.uid(), '2098', 'policy_new', 'New Driver', 'test', 'Test', 9);
        raise exception 'An unaccepted account inserted a Quick Rate rating';
    exception when insufficient_privilege then null;
    end;

    begin
        update public.user_race_ratings
        set rating = 9
        where driver_id = 'policy_existing';
        raise exception 'An unaccepted account changed an existing race rating';
    exception when insufficient_privilege then null;
    end;

    begin
        update public.user_quick_ratings
        set rating = 9
        where driver_id = 'policy_existing';
        raise exception 'An unaccepted account changed an existing Quick Rate rating';
    exception when insufficient_privilege then null;
    end;

    assert (select rating from public.user_quick_ratings where driver_id = 'policy_existing') = 7,
        'A rejected update changed an existing rating';
    assert (select community_eligible from public.user_race_ratings where driver_id = 'policy_existing'),
        'A rejected update changed existing race eligibility';
    assert not (select community_eligible from public.user_quick_ratings where driver_id = 'policy_existing'),
        'A rejected update changed existing Quick Rate eligibility';
end $$;

insert into public.community_policy_acceptances (user_id, policy_version)
select a, '2026-10-14' from policy_test_users;

insert into public.user_race_ratings
    (user_id, season, round, race_name, race_date, driver_id, driver_name, constructor_id, constructor_name, rating)
values (auth.uid(), '2098', '1', 'Policy Test GP', '2098-01-01', 'policy_new', 'New Driver', 'test', 'Test', 9);

insert into public.user_quick_ratings
    (user_id, season, driver_id, driver_name, constructor_id, constructor_name, rating)
values (auth.uid(), '2098', 'policy_new', 'New Driver', 'test', 'Test', 9);

update public.user_race_ratings
set rating = 9
where driver_id = 'policy_existing';

update public.user_quick_ratings
set rating = 9
where driver_id = 'policy_existing';

do $$
begin
    assert (select count(*) from public.user_race_ratings where driver_id = 'policy_new') = 1,
        'An accepted account could not add a race rating';
    assert (select count(*) from public.user_quick_ratings where driver_id = 'policy_new') = 1,
        'An accepted account could not add a Quick Rate rating';
    assert (select rating from public.user_race_ratings where driver_id = 'policy_existing') = 9,
        'An accepted account could not update a race rating';
    assert (select rating from public.user_quick_ratings where driver_id = 'policy_existing') = 9,
        'An accepted account could not update a Quick Rate rating';
    assert (select community_eligible from public.user_race_ratings where driver_id = 'policy_existing'),
        'Acceptance changed the community eligibility of an existing rating';
end $$;

reset role;
rollback;
