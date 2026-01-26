-- Add full_name column to admins table
ALTER TABLE public.admins 
ADD COLUMN IF NOT EXISTS full_name text;

-- Optional: Update existing records to have a default name if needed
UPDATE public.admins SET full_name = '未命名' WHERE full_name IS NULL;
