-- Enable RLS on admins table (ensure it is enabled)
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to insert their own record
-- This is necessary for the registration flow where a new user (just signed up)
-- needs to create their profile in the admins table.
CREATE POLICY "Admins can insert their own profile" 
ON public.admins 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Also ensure they can read their own profile (and maybe others if needed for dashboard?)
-- For now, let's allow them to read their own.
CREATE POLICY "Admins can view their own profile" 
ON public.admins 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- If we want super admin to see all, we might need broader policies later.
-- But for registration, the INSERT policy is critical.
