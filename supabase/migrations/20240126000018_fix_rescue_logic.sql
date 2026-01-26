-- Fix rescue_lost_classes function
-- The issue is that public.classes stores admin_id which should be the user_id.
-- However, when we search for lost data, we use find_lost_super_data which groups by c.admin_id.
-- The update query: UPDATE public.classes SET admin_id = v_new_owner_id WHERE admin_id = target_old_admin_id
-- This looks correct IF target_old_admin_id is indeed the admin_id stored in classes.

-- But wait, the screenshot shows "Successfully transferred 0 classes".
-- This implies the WHERE clause matched 0 rows.
-- Why?
-- Maybe the admin_id passed from frontend is somehow different from what's in DB?
-- OR maybe there's a type mismatch (uuid vs text)? (Postgres usually handles this)

-- Let's debug by checking if we can find the classes first.
-- We will modify the function to try harder to find the classes.

CREATE OR REPLACE FUNCTION rescue_lost_classes(
  target_old_admin_id uuid,
  new_owner_email text
)
RETURNS text
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_new_owner_id uuid;
  v_class_count int;
  v_debug_count int;
BEGIN
  -- 1. Find the new owner's ID (auth.users.id)
  -- Note: We need to join with public.admins to ensure it's a valid admin? 
  -- Or just trust the email exists in auth.users.
  SELECT id INTO v_new_owner_id FROM auth.users WHERE email = new_owner_email;
  
  IF v_new_owner_id IS NULL THEN
    RETURN format('Error: Target email %s not found in system.', new_owner_email);
  END IF;

  -- Debug: Check how many classes match the old ID before update
  SELECT count(*) INTO v_debug_count FROM public.classes WHERE admin_id = target_old_admin_id;
  
  IF v_debug_count = 0 THEN
    -- If 0, maybe the ID passed is actually from public.admins and we need to map it?
    -- But for "lost" data, the ID usually comes directly from classes.admin_id.
    RETURN format('Error: No classes found for ID %s. (Debug count: 0)', target_old_admin_id);
  END IF;

  -- 2. Update classes to point to the new owner
  WITH updated AS (
    UPDATE public.classes 
    SET admin_id = v_new_owner_id 
    WHERE admin_id = target_old_admin_id
    RETURNING id
  )
  SELECT count(*) INTO v_class_count FROM updated;

  -- 3. Return result
  RETURN format('Successfully transferred %s classes to %s (ID: %s). Please refresh.', v_class_count, new_owner_email, v_new_owner_id);
END;
$$ LANGUAGE plpgsql;
