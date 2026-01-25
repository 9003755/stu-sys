-- Add missing email_contact column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_contact VARCHAR(255);
