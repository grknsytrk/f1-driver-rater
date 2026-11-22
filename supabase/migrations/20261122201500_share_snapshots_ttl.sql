do $$
declare
    added_column boolean;
begin
    select not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'rating_share_snapshots'
          and column_name = 'expires_at'
    ) into added_column;

    alter table public.rating_share_snapshots
        add column if not exists expires_at timestamptz
        not null
        default (timezone('utc', now()) + interval '30 days');

    if added_column then
        update public.rating_share_snapshots
        set expires_at = created_at + interval '30 days';
    end if;
end
$$;

create index if not exists rating_share_snapshots_expires_at_idx
    on public.rating_share_snapshots (expires_at);

drop policy if exists "Public can read share snapshots" on public.rating_share_snapshots;

create policy "Public can read share snapshots"
    on public.rating_share_snapshots
    for select
    to anon, authenticated
    using (expires_at > timezone('utc', now()));

create or replace function public.prune_expired_share_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.rating_share_snapshots
    where expires_at <= timezone('utc', now());
    return null;
end;
$$;

drop trigger if exists trg_prune_expired_share_snapshots on public.rating_share_snapshots;

create trigger trg_prune_expired_share_snapshots
    after insert on public.rating_share_snapshots
    for each statement
    execute function public.prune_expired_share_snapshots();
