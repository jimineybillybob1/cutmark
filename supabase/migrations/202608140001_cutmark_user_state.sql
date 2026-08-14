create table public.cutmark_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bookmarks jsonb not null default '[]'::jsonb,
  defaults jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cutmark_user_state enable row level security;

create policy "Users can read their own Cutmark state"
on public.cutmark_user_state for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own Cutmark state"
on public.cutmark_user_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own Cutmark state"
on public.cutmark_user_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own Cutmark state"
on public.cutmark_user_state for delete
to authenticated
using ((select auth.uid()) = user_id);
