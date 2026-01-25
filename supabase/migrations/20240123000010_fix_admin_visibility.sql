-- Fix admin visibility policies for all tables
-- Ensure admins can see EVERYTHING

-- 1. Ensure admins table is readable (already public, but let's be safe for authenticated)
DROP POLICY IF EXISTS "Admins can view own record" ON public.admins;
-- We keep the "Allow public read access to admins" if it exists, or create a broad one for authenticated
CREATE POLICY "Authenticated can read admins"
ON public.admins
FOR SELECT
TO authenticated
USING (true);

-- 2. Fix Profiles RLS
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admins WHERE user_id = auth.uid()
    )
);

-- 3. Fix Enrollments RLS
-- Remove potentially conflicting policies
DROP POLICY IF EXISTS "Admins can manage enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Admins can view class enrollments" ON public.enrollments;

CREATE POLICY "Admins can manage all enrollments"
ON public.enrollments
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admins WHERE user_id = auth.uid()
    )
);

-- 4. Fix Classes RLS
-- Ensure admins can view/edit all classes
DROP POLICY IF EXISTS "Admins can insert classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can update classes" ON public.classes;

CREATE POLICY "Admins can manage all classes"
ON public.classes
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admins WHERE user_id = auth.uid()
    )
);
