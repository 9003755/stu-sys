-- Allow super-admin student deletion to remove dependent enrollment rows.
-- Older migrations created these foreign keys without ON DELETE CASCADE,
-- which causes auth.users deletion to fail with enrollments_user_id_fkey.

ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_user_id_fkey,
  DROP CONSTRAINT IF EXISTS enrollments_profile_id_fkey;

ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT enrollments_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
