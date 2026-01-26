-- Search for potential lost Super Admin accounts and their data
-- We look for users who own classes but might not be in our current admins view
-- or might be the 'old' super admin.

CREATE OR REPLACE FUNCTION find_lost_super_data()
RETURNS TABLE (
  admin_id uuid,
  user_email text,
  class_count bigint,
  class_names text,
  student_count bigint
)
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.admin_id,
    au.email::text,
    count(DISTINCT c.id)::bigint as class_count,
    string_agg(DISTINCT c.name, ', ')::text as class_names,
    count(DISTINCT e.id)::bigint as student_count
  FROM public.classes c
  LEFT JOIN auth.users au ON c.admin_id = au.id
  LEFT JOIN public.enrollments e ON e.class_id = c.id
  GROUP BY c.admin_id, au.email
  HAVING count(DISTINCT c.id) > 0;
END;
$$ LANGUAGE plpgsql;
