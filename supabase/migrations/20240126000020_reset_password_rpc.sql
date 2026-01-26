-- Create RPC to allow super admin to reset passwords
-- Security Definer allows this to run with elevated privileges (needed to update auth.users)
create or replace function reset_user_password(target_user_id uuid, new_password text)
returns void
security definer
set search_path = public, auth, extensions
as $$
declare
  caller_email text;
begin
  -- 1. Check if caller is super admin
  select email into caller_email from auth.users where id = auth.uid();
  
  -- Hardcoded check for super admin email (same as in other RPCs)
  if caller_email != 'neoyt@126.com' then
    raise exception 'Permission denied: Only super admin can reset passwords.';
  end if;

  -- 2. Update the password
  -- We update the auth.users table directly. 
  -- Note: We must use crypt() to hash the password.
  -- Supabase uses bcrypt.
  
  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = target_user_id;
  
  if not found then
    raise exception 'User not found';
  end if;
end;
$$ language plpgsql;
