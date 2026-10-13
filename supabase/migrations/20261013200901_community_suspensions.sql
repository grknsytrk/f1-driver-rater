-- Suspension records stay private; clients can only ask about their own status.
create table if not exists community_private.community_suspensions (
    user_id uuid primary key references auth.users(id) on delete cascade,
    is_active boolean not null default true,
    suspended_at timestamptz not null default timezone('utc', now()),
    admin_note text not null default ''
);

alter table community_private.community_suspensions enable row level security;
revoke all on table community_private.community_suspensions from public, anon, authenticated;

create or replace function community_private.prevent_suspended_community_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (
        select 1
        from community_private.community_suspensions s
        where s.user_id = new.user_id
          and s.is_active
    ) then
        new.community_eligible := false;
    end if;
    return new;
end;
$$;

revoke all on function community_private.prevent_suspended_community_rating() from public, anon, authenticated;

drop trigger if exists enforce_race_community_suspension on public.user_race_ratings;
create trigger enforce_race_community_suspension
    before insert or update of user_id, community_eligible
    on public.user_race_ratings
    for each row
    execute function community_private.prevent_suspended_community_rating();

drop trigger if exists enforce_quick_community_suspension on public.user_quick_ratings;
create trigger enforce_quick_community_suspension
    before insert or update of user_id, community_eligible
    on public.user_quick_ratings
    for each row
    execute function community_private.prevent_suspended_community_rating();

create or replace function community_private.remove_suspended_ratings_from_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.is_active then
        update public.user_race_ratings
        set community_eligible = false
        where user_id = new.user_id
          and community_eligible;

        update public.user_quick_ratings
        set community_eligible = false
        where user_id = new.user_id
          and community_eligible;
    end if;
    return new;
end;
$$;

revoke all on function community_private.remove_suspended_ratings_from_community() from public, anon, authenticated;

drop trigger if exists remove_suspended_ratings_from_community on community_private.community_suspensions;
create trigger remove_suspended_ratings_from_community
    after insert or update of is_active
    on community_private.community_suspensions
    for each row
    when (new.is_active)
    execute function community_private.remove_suspended_ratings_from_community();

create or replace function community_private.current_user_is_community_suspended()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'Authentication required' using errcode = '42501';
    end if;

    return exists (
        select 1
        from community_private.community_suspensions s
        where s.user_id = current_user_id
          and s.is_active
    );
end;
$$;

revoke all on function community_private.current_user_is_community_suspended() from public, anon, authenticated;
grant usage on schema community_private to authenticated;
grant execute on function community_private.current_user_is_community_suspended() to authenticated;

create or replace function public.get_community_suspension_status()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select community_private.current_user_is_community_suspended();
$$;

revoke all on function public.get_community_suspension_status() from public, anon, authenticated;
grant execute on function public.get_community_suspension_status() to authenticated;

comment on function public.get_community_suspension_status() is
    'Returns only whether the current authenticated user has an active community-rating suspension.';

-- Carry forward the account already suspended by the current site notice.
-- Inserting it also removes any eligible historical race or Quick Rate votes.
insert into community_private.community_suspensions as existing (user_id, admin_note)
values (
    'e0b55267-2c8c-4cae-9ac0-58233a93e0f2',
    'Existing indefinite community-rating suspension; rating manipulation.'
), (
    'ec5b082a-4d1b-41e7-8dc9-db2f5bd64772',
    'User-directed indefinite community-rating suspension.'
)
on conflict (user_id) do update
set is_active = true,
    admin_note = excluded.admin_note,
    suspended_at = case
        when existing.is_active then existing.suspended_at
        else timezone('utc', now())
    end;
