-- Update classes table to match new requirements
ALTER TABLE public.classes 
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'recruiting',
  ALTER COLUMN admin_id DROP NOT NULL,
  ALTER COLUMN class_code DROP NOT NULL;

-- If class_code is unique constraint and causes issues with nulls (though usually nulls allowed in unique),
-- we might need to handle it, but standard SQL allows multiple NULLs in unique columns.
-- Let's just drop the column if it's not needed, OR keep it flexible.
-- For now, dropping the NOT NULL constraint is enough to fix the insertion error if we don't provide it.

-- Ensure status is set for existing rows
UPDATE public.classes SET status = 'recruiting' WHERE status IS NULL;
