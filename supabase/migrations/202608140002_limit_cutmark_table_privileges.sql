revoke all privileges on table public.cutmark_user_state from anon, authenticated;
grant select, insert, update on table public.cutmark_user_state to authenticated;

drop policy "Users can delete their own Cutmark state"
on public.cutmark_user_state;
