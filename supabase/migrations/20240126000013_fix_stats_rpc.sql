-- Fix the RPC function to correctly map admin_id (public.admins PK) to user_id (auth.users PK)
-- Because classes table stores user_id in its admin_id column.

CREATE OR REPLACE FUNCTION get_admin_class_stats(target_admin_id uuid)
RETURNS TABLE (
  class_id uuid,
  class_name text,
  student_count bigint
)
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- 1. Resolve the correct user_id from the provided public.admins.id
  SELECT user_id INTO v_user_id 
  FROM public.admins 
  WHERE id = target_admin_id;

  -- If not found via PK, maybe the input IS ALREADY a user_id? 
  -- Let's try to match user_id directly if first lookup failed.
  IF v_user_id IS NULL THEN
     -- Assume input might be user_id directly
     v_user_id := target_admin_id;
  END IF;

  RETURN QUERY
  SELECT 
    c.id,
    c.name::text,
    (SELECT count(*) FROM public.enrollments e WHERE e.class_id = c.id)::bigint
  FROM public.classes c
  WHERE c.admin_id = v_user_id -- Now using the correct user_id
  ORDER BY c.created_at DESC;
END;
$$ LANGUAGE plpgsql;
