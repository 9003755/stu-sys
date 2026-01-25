-- Create user if not exists (This part is tricky in pure SQL for Supabase Auth, 
-- but we can insert into auth.users directly if we are superuser/postgres role)
-- However, we can't easily hash password to match Supabase's bcrypt format in pure SQL without pgcrypto extension enabled and matching salt.

-- ALTERNATIVE SIMPLEST APPROACH:
-- 1. Enable RLS policy to allow anyone to read admins table (so login check works)
CREATE POLICY "Allow public read access to admins"
ON public.admins FOR SELECT
TO public
USING (true);

-- 2. Create a trigger or function to auto-promote specific email to admin
-- BUT simpler: Let's just fix the "Email not confirmed" by updating the user status if they exist.
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email = 'super@admin.com';

-- 3. Insert the admin record for this user (if user exists)
INSERT INTO public.admins (user_id, admin_type)
SELECT id, 'super'
FROM auth.users
WHERE email = 'super@admin.com'
ON CONFLICT (user_id) DO NOTHING;
