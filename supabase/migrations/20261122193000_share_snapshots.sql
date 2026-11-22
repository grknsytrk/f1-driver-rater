create table if not exists public.rating_share_snapshots (
    id text primary key check (char_length(id) between 6 and 16),
    season text not null check (season ~ '^\d{4}$'),
    mode text not null check (mode in ('personal', 'community')),
    source text not null check (source in ('race', 'quick')),
    rated_races integer not null default 0 check (rated_races >= 0 and rated_races <= 40),
    title text check (title is null or char_length(title) <= 60),
    payload jsonb not null check (
        jsonb_typeof(payload) = 'array'
        and jsonb_array_length(payload) between 1 and 30
    ),
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists rating_share_snapshots_season_idx
    on public.rating_share_snapshots (season, created_at desc);

alter table public.rating_share_snapshots enable row level security;

revoke all on table public.rating_share_snapshots from anon, authenticated;
grant select, insert on table public.rating_share_snapshots to anon, authenticated;

drop policy if exists "Public can read share snapshots" on public.rating_share_snapshots;
drop policy if exists "Anyone can insert bounded share snapshots" on public.rating_share_snapshots;

create policy "Public can read share snapshots"
    on public.rating_share_snapshots
    for select
    to anon, authenticated
    using (true);

create policy "Anyone can insert bounded share snapshots"
    on public.rating_share_snapshots
    for insert
    to anon, authenticated
    with check (
        char_length(id) between 6 and 16
        and season ~ '^\d{4}$'
        and mode in ('personal', 'community')
        and source in ('race', 'quick')
        and rated_races >= 0
        and rated_races <= 40
        and jsonb_typeof(payload) = 'array'
        and jsonb_array_length(payload) between 1 and 30
    );
