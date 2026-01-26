-- Create a powerful RPC function to delete an admin and their auth user
-- This requires elevated privileges (SECURITY DEFINER)
-- NOTE: Standard Postgres cannot delete from auth.users directly unless it has permissions.
-- By default, supabase_admin or postgres role can do it.
-- Our function runs as the owner (postgres), so it should work.

CREATE OR REPLACE FUNCTION delete_admin_by_super(target_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 1. Delete from public.admins (This will trigger cascade if set up, or we do it manually)
  -- But we want to delete from auth.users to truly remove the login.
  -- Deleting from auth.users usually cascades to public.admins via FK.
  
  -- Let's try deleting from auth.users directly.
  DELETE FROM auth.users WHERE id = target_user_id;
  
  -- If that fails (e.g. strict RLS on auth schema), we might need another approach.
  -- But SECURITY DEFINER functions owned by postgres *can* delete from auth.users.
  
  -- Fallback: If the above didn't delete from public.admins (due to no cascade), do it manually.
  DELETE FROM public.admins WHERE user_id = target_user_id;
  
  -- Also clean up classes and enrollments if they weren't cascaded
  -- (Assuming they are linked to user_id or admin_id)
  -- We don't strictly need this if FKs are ON DELETE CASCADE, but for safety:
  DELETE FROM public.classes WHERE admin_id = target_user_id;
  
END;
$$ LANGUAGE plpgsql;
