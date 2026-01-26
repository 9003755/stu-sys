-- Fix rescue_lost_classes function to handle NULL admin_id
-- If target_old_admin_id IS NULL, we should update where admin_id IS NULL.

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
  -- 1. Find the new owner's ID
  SELECT id INTO v_new_owner_id FROM auth.users WHERE email = new_owner_email;
  
  IF v_new_owner_id IS NULL THEN
    RETURN format('Error: Target email %s not found in system.', new_owner_email);
  END IF;

  -- 2. Check if we are rescuing classes with NULL admin_id
  IF target_old_admin_id IS NULL THEN
     -- Count first
     SELECT count(*) INTO v_debug_count FROM public.classes WHERE admin_id IS NULL;
     
     IF v_debug_count = 0 THEN
       RETURN 'Error: No classes found with NULL admin_id.';
     END IF;
     
     -- Update NULLs
     WITH updated AS (
       UPDATE public.classes 
       SET admin_id = v_new_owner_id 
       WHERE admin_id IS NULL
       RETURNING id
     )
     SELECT count(*) INTO v_class_count FROM updated;
     
  ELSE
     -- Normal rescue by ID
     SELECT count(*) INTO v_debug_count FROM public.classes WHERE admin_id = target_old_admin_id;
     
     IF v_debug_count = 0 THEN
       RETURN format('Error: No classes found for ID %s. (Debug count: 0)', target_old_admin_id);
     END IF;

     WITH updated AS (
       UPDATE public.classes 
       SET admin_id = v_new_owner_id 
       WHERE admin_id = target_old_admin_id
       RETURNING id
     )
     SELECT count(*) INTO v_class_count FROM updated;
  END IF;

  -- 3. Return result
  RETURN format('Successfully transferred %s classes to %s (ID: %s). Please refresh.', v_class_count, new_owner_email, v_new_owner_id);
END;
$$ LANGUAGE plpgsql;
