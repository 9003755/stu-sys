-- Update the delete_admin_by_super function to include cleaning up enrollments
-- And deleting classes (which might already be covered if we delete by admin_id)

CREATE OR REPLACE FUNCTION delete_admin_by_super(target_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 1. First, delete all enrollments associated with classes owned by this admin
  -- We need to find all class IDs owned by this admin first
  DELETE FROM public.enrollments 
  WHERE class_id IN (
    SELECT id FROM public.classes WHERE admin_id = target_user_id
  );

  -- 2. Delete all classes owned by this admin
  DELETE FROM public.classes WHERE admin_id = target_user_id;

  -- 3. Delete from public.admins 
  DELETE FROM public.admins WHERE user_id = target_user_id;
  
  -- 4. Finally delete from auth.users
  DELETE FROM auth.users WHERE id = target_user_id;
  
END;
$$ LANGUAGE plpgsql;
