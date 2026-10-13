create table public.community_policy_acceptances (
    user_id uuid not null references auth.users(id) on delete cascade,
    policy_version text not null,
    accepted_at timestamptz not null default now(),
    primary key (user_id, policy_version)
);

alter table public.community_policy_acceptances enable row level security;
revoke all on table public.community_policy_acceptances from public, anon, authenticated;
grant select, insert on table public.community_policy_acceptances to authenticated;

create policy "Guests can read their own policy acceptances"
    on public.community_policy_acceptances
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

create policy "Guests can create their own policy acceptances"
    on public.community_policy_acceptances
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Guests can insert their own race ratings" on public.user_race_ratings;
create policy "Guests can insert their own race ratings"
    on public.user_race_ratings
    for insert
    to authenticated
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1
            from public.community_policy_acceptances acceptance
            where acceptance.user_id = (select auth.uid())
                and acceptance.policy_version = '2026-10-14'
        )
    );

drop policy if exists "Guests can update their own race ratings" on public.user_race_ratings;
create policy "Guests can update their own race ratings"
    on public.user_race_ratings
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1
            from public.community_policy_acceptances acceptance
            where acceptance.user_id = (select auth.uid())
                and acceptance.policy_version = '2026-10-14'
        )
    );

drop policy if exists "Guests can insert their own quick ratings" on public.user_quick_ratings;
create policy "Guests can insert their own quick ratings"
    on public.user_quick_ratings
    for insert
    to authenticated
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1
            from public.community_policy_acceptances acceptance
            where acceptance.user_id = (select auth.uid())
                and acceptance.policy_version = '2026-10-14'
        )
    );

drop policy if exists "Guests can update their own quick ratings" on public.user_quick_ratings;
create policy "Guests can update their own quick ratings"
    on public.user_quick_ratings
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1
            from public.community_policy_acceptances acceptance
            where acceptance.user_id = (select auth.uid())
                and acceptance.policy_version = '2026-10-14'
        )
    );

comment on table public.community_policy_acceptances is
    'Records the site policy version accepted by each guest account.';
