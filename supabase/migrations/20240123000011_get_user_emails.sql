-- Create a function to allow admins to look up emails by user IDs
CREATE OR REPLACE FUNCTION get_user_emails(user_ids uuid[])
RETURNS TABLE (user_id uuid, email text)
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if the calling user is an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT id, auth.users.email::text
  FROM auth.users
  WHERE id = ANY(user_ids);
END;
$$ LANGUAGE plpgsql;
