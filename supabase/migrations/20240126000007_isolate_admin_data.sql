-- 1. Enable RLS on classes table (if not already)
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies on classes to avoid conflicts/loopholes
DROP POLICY IF EXISTS "Admins can view all classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can insert classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can update their classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can delete their classes" ON public.classes;
DROP POLICY IF EXISTS "Public can view active classes" ON public.classes;

-- 3. Create Strict Isolation Policies for Classes

-- SELECT: Admins can ONLY see classes they created.
-- Exception: Super admins might want to see all?
-- For now, per user request: "Each admin is independent".
-- Note: Students/Public need to see classes to enroll.
-- So we need TWO policies for SELECT:
-- A) Public/Anon can see 'active' classes (for enrollment page)
-- B) Admins can see classes where admin_id = auth.uid()

CREATE POLICY "Public can view active classes"
ON public.classes FOR SELECT
USING (is_active = true); 

CREATE POLICY "Admins can view own classes"
ON public.classes FOR SELECT
TO authenticated
USING (admin_id = auth.uid());

-- INSERT: Admins can insert, and must set admin_id to themselves
CREATE POLICY "Admins can insert classes"
ON public.classes FOR INSERT
TO authenticated
WITH CHECK (admin_id = auth.uid());

-- UPDATE: Admins can update their own classes
CREATE POLICY "Admins can update own classes"
ON public.classes FOR UPDATE
TO authenticated
USING (admin_id = auth.uid());

-- DELETE: Admins can delete their own classes
CREATE POLICY "Admins can delete own classes"
ON public.classes FOR DELETE
TO authenticated
USING (admin_id = auth.uid());


-- 4. Enable RLS on enrollments table
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies on enrollments
DROP POLICY IF EXISTS "Admins can view enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Students can view own enrollments" ON public.enrollments;

-- 6. Create Strict Isolation Policies for Enrollments

-- SELECT: 
-- A) Students can see their own enrollments
-- B) Admins can see enrollments ONLY for classes they own.
-- This requires a join check. RLS allows subqueries.

CREATE POLICY "Students can view own enrollments"
ON public.enrollments FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view enrollments for their classes"
ON public.enrollments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = class_id
    AND c.admin_id = auth.uid()
  )
);

-- UPDATE/DELETE for Admins
CREATE POLICY "Admins can manage enrollments for their classes"
ON public.enrollments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = class_id
    AND c.admin_id = auth.uid()
  )
);

CREATE POLICY "Admins can delete enrollments for their classes"
ON public.enrollments FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = class_id
    AND c.admin_id = auth.uid()
  )
);
