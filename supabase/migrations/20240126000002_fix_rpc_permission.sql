-- Secure function to get all admins with their emails
-- We explicitly grant execution permission to authenticated users (including admins/super admins)
CREATE OR REPLACE FUNCTION get_all_admins()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  full_name text,
  created_at timestamptz,
  email text
)
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Simple check to ensure user is logged in
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT 
    a.id,
    a.user_id,
    a.full_name,
    a.created_at,
    au.email::text
  FROM public.admins a
  JOIN auth.users au ON a.user_id = au.id
  ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_all_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_admins() TO service_role;
