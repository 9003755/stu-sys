-- Update profiles table to match registration form fields

-- 1. Rename existing columns to match form terminology better
ALTER TABLE public.profiles RENAME COLUMN id_card TO id_number;
ALTER TABLE public.profiles RENAME COLUMN address TO address_detail;

-- 2. Add missing columns from the registration form
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id_type VARCHAR(50);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nationality VARCHAR(50) DEFAULT '中国';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ethnicity VARCHAR(50) DEFAULT '汉族';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20);

-- 3. Update comments/descriptions (Optional, for documentation)
COMMENT ON COLUMN public.profiles.id_number IS '证件号码';
COMMENT ON COLUMN public.profiles.id_type IS '证件类型';
COMMENT ON COLUMN public.profiles.region IS '地址 (省/市/区)';
COMMENT ON COLUMN public.profiles.address_detail IS '详细地址';
