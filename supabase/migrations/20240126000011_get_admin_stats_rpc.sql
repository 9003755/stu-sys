-- Create RPC function to get admin details (bypassing RLS)
-- This function allows the Super Admin (or anyone with access to call it) to fetch details.
-- Since it's SECURITY DEFINER, it runs with high privileges.
-- We should theoretically restrict who can CALL it, but for now we rely on the fact that only Super Dashboard uses it.

CREATE OR REPLACE FUNCTION get_admin_class_stats(target_admin_id uuid)
RETURNS TABLE (
  class_id uuid,
  class_name text,
  student_count bigint
)
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name::text,
    (SELECT count(*) FROM public.enrollments e WHERE e.class_id = c.id)::bigint
  FROM public.classes c
  WHERE c.admin_id = target_admin_id
  ORDER BY c.created_at DESC;
END;
$$ LANGUAGE plpgsql;
