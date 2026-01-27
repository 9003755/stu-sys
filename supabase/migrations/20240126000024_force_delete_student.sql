-- Function to FORCE delete a student, even if they have profile/enrollment
-- CAUTION: This will cascade delete profile and enrollment data
create or replace function force_delete_student(target_user_id uuid)
returns void
security definer
set search_path = public, auth
as $$
begin
  -- Safety check: Prevent deleting admins
  if exists (select 1 from public.admins where user_id = target_user_id) then
     raise exception 'Cannot delete an admin account via this function.';
  end if;

  -- Delete from auth.users (Cascades to profiles, enrollments due to foreign keys)
  delete from auth.users where id = target_user_id;
end;
$$ language plpgsql;

-- Grant permissions
grant execute on function force_delete_student(uuid) to authenticated;
grant execute on function force_delete_student(uuid) to service_role;
