-- Clean up zombie users that exist in Auth but not in public.admins
-- Specifically target the reported emails to allow recreation

DELETE FROM auth.users 
WHERE email IN ('gl2@guanli.com', 'gl2@guanlic.com');
