-- Fix RLS policies to allow Super Admin to see everything
-- Super Admin is identified by email 'neoyt@126.com' or specific ID.
-- However, in RLS, checking email directly in every query is slow.
-- Better to use a claim or role. But for now, we can check the email in the auth.users table via a helper or direct query.

-- Or, since we want strict isolation for 'normal' admins, but full access for 'super'.
-- We can add a policy for super admin.

-- 1. Get Super Admin ID (we know it from context or can lookup)
-- Actually, the best way is to check if the current user is in the 'admins' table with type 'super' (if we had that column set).
-- We do have 'admin_type' column in public.admins!

-- Let's update the RLS policies for classes and enrollments to include Super Admin access.

-- Policy for Classes: Super Admin can view ALL classes
CREATE POLICY "Super Admin can view all classes"
ON public.classes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = auth.uid()
    AND admin_type = 'super'
  )
);

-- Policy for Enrollments: Super Admin can view ALL enrollments
CREATE POLICY "Super Admin can view all enrollments"
ON public.enrollments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = auth.uid()
    AND admin_type = 'super'
  )
);

-- Ensure the 'super' user in public.admins actually has admin_type = 'super'
-- We might need to manually set it if it wasn't set during creation.
UPDATE public.admins 
SET admin_type = 'super' 
WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'neoyt@126.com'
);
