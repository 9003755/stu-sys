-- Clean up specific zombie admin accounts that failed registration
-- These accounts exist in auth.users but likely missing from public.admins

DELETE FROM auth.users 
WHERE email IN (
    'gl2@guanli.com', 
    'gl3@guanli.com', 
    'gl5@guanli.com'
);
