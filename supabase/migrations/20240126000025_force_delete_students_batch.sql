-- Function to FORCE delete multiple students by IDs
-- CAUTION: This will cascade delete profile and enrollment data for all targets
create or replace function force_delete_students_batch(target_user_ids uuid[])
returns void
security definer
set search_path = public, auth
as $$
begin
  -- Safety check: Ensure NONE of the target users are admins
  if exists (
    select 1 from public.admins where user_id = any(target_user_ids)
  ) then
     raise exception 'Safety check failed: One or more selected users are admins.';
  end if;

  -- Delete from auth.users (Cascades to profiles, enrollments)
  delete from auth.users where id = any(target_user_ids);
end;
$$ language plpgsql;

-- Grant permissions
grant execute on function force_delete_students_batch(uuid[]) to authenticated;
grant execute on function force_delete_students_batch(uuid[]) to service_role;
