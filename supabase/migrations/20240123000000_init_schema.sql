-- Create Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    real_name VARCHAR(100),
    id_card VARCHAR(18) UNIQUE,
    gender VARCHAR(10),
    birth_date DATE,
    photo_url TEXT,
    id_card_front_url TEXT,
    id_card_back_url TEXT,
    address TEXT,
    emergency_contact VARCHAR(100),
    emergency_phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Admins table
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    admin_type VARCHAR(20) DEFAULT 'normal' CHECK (admin_type IN ('normal', 'super')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Classes table
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    admin_id UUID REFERENCES auth.users(id) NOT NULL,
    class_code VARCHAR(20) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    max_students INTEGER DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Enrollments table
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) NOT NULL,
    class_id UUID REFERENCES public.classes(id) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped')),
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(profile_id, class_id)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Basic Policies

-- Profiles:
-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON public.profiles 
    FOR SELECT USING (auth.uid() = user_id);
-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON public.profiles 
    FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles 
    FOR UPDATE USING (auth.uid() = user_id);
-- Admins can view all profiles (Simplified for now, assumes admin check logic exists or handled via service role for admin tasks)
-- Ideally we check if auth.uid() exists in admins table.
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid())
    );

-- Classes:
-- Everyone can view classes (needed for joining)
CREATE POLICY "Classes are viewable by everyone" ON public.classes 
    FOR SELECT USING (true);
-- Only admins can insert/update classes
CREATE POLICY "Admins can insert classes" ON public.classes 
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid())
    );
CREATE POLICY "Admins can update classes" ON public.classes 
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid())
    );

-- Enrollments:
-- Users can view their own enrollments
CREATE POLICY "Users can view own enrollments" ON public.enrollments 
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = enrollments.profile_id AND user_id = auth.uid())
    );
-- Admins can view enrollments for their classes
CREATE POLICY "Admins can view class enrollments" ON public.enrollments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.classes WHERE id = enrollments.class_id AND admin_id = auth.uid())
    );

-- Admins Table:
-- Only viewable by self or super admin (simplification: viewable by self)
CREATE POLICY "Admins can view own record" ON public.admins 
    FOR SELECT USING (auth.uid() = user_id);

