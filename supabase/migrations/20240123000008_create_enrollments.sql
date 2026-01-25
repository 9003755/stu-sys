-- Create enrollments table
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, class_id) -- Prevent double enrollment
);

-- Enable RLS
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Policies

-- 1. Admins can view and manage all enrollments
CREATE POLICY "Admins can manage enrollments"
ON public.enrollments
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admins WHERE user_id = auth.uid()
    )
);

-- 2. Users can view their own enrollments
CREATE POLICY "Users can view own enrollments"
ON public.enrollments
FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
);

-- 3. Users can create their own enrollments (join class)
CREATE POLICY "Users can create own enrollments"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
);
