create table if not exists public.user_race_ratings (
    user_id uuid not null references auth.users(id) on delete cascade,
    season text not null,
    round text not null,
    race_name text not null,
    race_date text not null,
    driver_id text not null,
    driver_name text not null,
    constructor_id text not null,
    constructor_name text not null,
    rating numeric(3, 1) not null check (rating >= 0 and rating <= 10),
    created_at timestamptz not null default timezone('utc', now()),
    primary key (user_id, season, round, driver_id)
);

create table if not exists public.user_quick_ratings (
    user_id uuid not null references auth.users(id) on delete cascade,
    season text not null,
    driver_id text not null,
    driver_name text not null,
    constructor_id text not null,
    constructor_name text not null,
    rating numeric(3, 1) not null check (rating >= 0 and rating <= 10),
    created_at timestamptz not null default timezone('utc', now()),
    primary key (user_id, season, driver_id)
);

alter table public.user_race_ratings enable row level security;
alter table public.user_quick_ratings enable row level security;

revoke all on table public.user_race_ratings from anon;
revoke all on table public.user_quick_ratings from anon;

grant select, insert, update, delete on table public.user_race_ratings to authenticated;
grant select, insert, update, delete on table public.user_quick_ratings to authenticated;

drop policy if exists "Guests can read their own race ratings" on public.user_race_ratings;
drop policy if exists "Guests can insert their own race ratings" on public.user_race_ratings;
drop policy if exists "Guests can update their own race ratings" on public.user_race_ratings;
drop policy if exists "Guests can delete their own race ratings" on public.user_race_ratings;
drop policy if exists "Guests can read their own quick ratings" on public.user_quick_ratings;
drop policy if exists "Guests can insert their own quick ratings" on public.user_quick_ratings;
drop policy if exists "Guests can update their own quick ratings" on public.user_quick_ratings;
drop policy if exists "Guests can delete their own quick ratings" on public.user_quick_ratings;

create policy "Guests can read their own race ratings"
    on public.user_race_ratings
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

create policy "Guests can insert their own race ratings"
    on public.user_race_ratings
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Guests can update their own race ratings"
    on public.user_race_ratings
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Guests can delete their own race ratings"
    on public.user_race_ratings
    for delete
    to authenticated
    using ((select auth.uid()) = user_id);

create policy "Guests can read their own quick ratings"
    on public.user_quick_ratings
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

create policy "Guests can insert their own quick ratings"
    on public.user_quick_ratings
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Guests can update their own quick ratings"
    on public.user_quick_ratings
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Guests can delete their own quick ratings"
    on public.user_quick_ratings
    for delete
    to authenticated
    using ((select auth.uid()) = user_id);

-- The automatic RLS event trigger is an internal database helper, not a public RPC.
-- Keep it out of the Data API when it exists in the project.
do $$
begin
    if to_regprocedure('public.rls_auto_enable()') is not null then
        execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, public';
    end if;
end;
$$;
