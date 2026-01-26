-- Fix ambiguous column reference in get_user_emails function
CREATE OR REPLACE FUNCTION get_user_emails(user_ids uuid[])
RETURNS TABLE (user_id uuid, email text)
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if the calling user is an admin
  -- Use alias 'a' to avoid ambiguity between table column 'user_id' and output parameter 'user_id'
  IF NOT EXISTS (
    SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT au.id, au.email::text
  FROM auth.users au
  WHERE au.id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql;
