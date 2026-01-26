-- Debug: Check Super Admin status
-- This function will return the details of the super admin if it exists
CREATE OR REPLACE FUNCTION check_super_admin_status()
RETURNS TABLE (
  auth_email text,
  admin_record_exists boolean,
  admin_type text,
  admin_full_name text
)
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- 1. Find the user ID for neoyt@126.com
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'neoyt@126.com';
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 'neoyt@126.com'::text, false, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- 2. Check public.admins
  RETURN QUERY
  SELECT 
    au.email::text,
    (pa.id IS NOT NULL),
    pa.admin_type::text,
    pa.full_name::text
  FROM auth.users au
  LEFT JOIN public.admins pa ON pa.user_id = au.id
  WHERE au.id = v_user_id;
END;
$$ LANGUAGE plpgsql;
