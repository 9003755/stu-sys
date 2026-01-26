-- Fix lost admin data by creating a placeholder admin record
-- This allows the system to recognize the admin_id and we can then see/manage the data.
-- Since the email is NULL (auth user deleted but class.admin_id remains?), we need to attach it to a REAL user.
-- OR if the auth user exists but email is null (rare), we can update it.

-- Scenario: The class.admin_id points to a UUID that does NOT exist in auth.users anymore.
-- Or it exists in auth.users but for some reason email is null in our join.

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
BEGIN
  -- 1. Find the new owner's ID
  SELECT id INTO v_new_owner_id FROM auth.users WHERE email = new_owner_email;
  
  IF v_new_owner_id IS NULL THEN
    RETURN 'Error: Target new owner email not found in system.';
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
  RETURN format('Successfully transferred %s classes to %s. Please refresh.', v_class_count, new_owner_email);
END;
$$ LANGUAGE plpgsql;
