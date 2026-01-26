-- Create a function to inspect class ownership for debugging
-- This allows us to see who owns which class without being blocked by RLS
CREATE OR REPLACE FUNCTION debug_class_ownership()
RETURNS TABLE (
  class_name text,
  admin_id uuid,
  admin_email text
)
SECURITY DEFINER -- Runs with elevated privileges
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.name::text,
    c.admin_id,
    au.email::text
  FROM public.classes c
  LEFT JOIN auth.users au ON c.admin_id = au.id;
END;
$$ LANGUAGE plpgsql;
