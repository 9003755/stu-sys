-- Debug RPC: Check if there are ANY classes for this admin
-- And also check what user_id this admin record maps to.
CREATE OR REPLACE FUNCTION debug_admin_data(target_admin_id uuid)
RETURNS TABLE (
  admin_id_in_admins_table uuid,
  user_id_in_admins_table uuid,
  email_in_auth text,
  class_count_raw bigint,
  class_names text
)
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- 1. Get user_id from admins table
  SELECT user_id INTO v_user_id FROM public.admins WHERE id = target_admin_id;
  
  RETURN QUERY
  SELECT 
    target_admin_id,
    v_user_id,
    (SELECT email::text FROM auth.users WHERE id = v_user_id),
    (SELECT count(*) FROM public.classes WHERE admin_id = v_user_id), -- Check using user_id
    (SELECT string_agg(name, ', ') FROM public.classes WHERE admin_id = v_user_id)::text;
END;
$$ LANGUAGE plpgsql;
