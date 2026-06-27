ALTER TABLE public.enrollments
ADD COLUMN IF NOT EXISTS exam_type VARCHAR(50);

COMMENT ON COLUMN public.enrollments.exam_type IS '报考类型';
