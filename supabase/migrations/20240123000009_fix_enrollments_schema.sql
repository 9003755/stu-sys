-- Fix enrollments table schema
-- 1. Add user_id column if not exists
ALTER TABLE public.enrollments 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Drop existing status check constraint if it restricts us
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_status_check;

-- 3. Populate user_id from profile_id if possible (for existing rows)
UPDATE public.enrollments e
SET user_id = p.user_id
FROM public.profiles p
WHERE e.profile_id = p.id AND e.user_id IS NULL;

-- 4. Re-apply RLS policies with user_id check
DROP POLICY IF EXISTS "Users can view own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Users can create own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Admins can manage enrollments" ON public.enrollments;

CREATE POLICY "Admins can manage enrollments"
ON public.enrollments
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admins WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can view own enrollments"
ON public.enrollments
FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
);

CREATE POLICY "Users can create own enrollments"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
);
