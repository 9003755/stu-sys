-- Create classes table
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE,
    status VARCHAR(50) DEFAULT 'recruiting', -- recruiting, ongoing, finished
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Admins can do everything
CREATE POLICY "Admins can do everything on classes"
ON public.classes
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admins WHERE user_id = auth.uid()
    )
);

-- 2. Everyone (public) can view classes (needed for enrollment)
CREATE POLICY "Public can view classes"
ON public.classes
FOR SELECT
TO public
USING (true);
