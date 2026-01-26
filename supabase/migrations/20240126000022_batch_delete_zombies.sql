-- Function to delete multiple zombie users by IDs
create or replace function delete_zombie_users_batch(target_user_ids uuid[])
returns void
security definer
set search_path = public, auth
as $$
begin
  -- Safety check: Ensure NONE of the target users have profiles or are admins
  if exists (
    select 1 from public.profiles where user_id = any(target_user_ids)
  ) or exists (
    select 1 from public.admins where user_id = any(target_user_ids)
  ) then
     raise exception 'Safety check failed: One or more users have profiles or are admins.';
  end if;

  -- Delete from auth.users
  delete from auth.users where id = any(target_user_ids);
end;
$$ language plpgsql;

-- Grant permissions
grant execute on function delete_zombie_users_batch(uuid[]) to authenticated;
grant execute on function delete_zombie_users_batch(uuid[]) to service_role;
