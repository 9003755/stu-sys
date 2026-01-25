-- Create a function to handle super admin setup
CREATE OR REPLACE FUNCTION public.setup_super_admin(
    admin_email TEXT,
    admin_password TEXT
) RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
BEGIN
    -- Check if user already exists in auth.users
    SELECT id INTO new_user_id FROM auth.users WHERE email = admin_email;
    
    -- If user doesn't exist, we can't easily create it via SQL due to password hashing requirements
    -- Supabase auth.users inserts are usually handled by the GoTrue API
    -- However, for this specific task, we'll assume the user might be created via the API first
    -- OR we return null to signal that the frontend should create the user first
    
    IF new_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Insert into admins table if not exists
    INSERT INTO public.admins (user_id, admin_type)
    VALUES (new_user_id, 'super')
    ON CONFLICT (user_id) DO UPDATE
    SET admin_type = 'super';

    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
