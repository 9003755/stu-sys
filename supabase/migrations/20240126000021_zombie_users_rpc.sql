-- Function to get zombie users (registered but no profile and not admin)
-- Only accessible by super admin
create or replace function get_zombie_users()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
security definer
set search_path = public, auth
as $$
declare
  caller_email text;
begin
  -- Check permission
  select email into caller_email from auth.users where id = auth.uid();
  if caller_email != 'neoyt@126.com' then
    raise exception 'Permission denied';
  end if;

  return query
  select 
    au.id, 
    au.email::text, 
    au.created_at,
    au.last_sign_in_at
  from auth.users au
  left join public.profiles p on au.id = p.user_id
  left join public.admins a on au.id = a.user_id
  where p.id is null 
    and a.id is null
  order by au.created_at desc;
end;
$$ language plpgsql;

-- Function to delete a zombie user by ID
-- Only accessible by super admin
create or replace function delete_zombie_user(target_user_id uuid)
returns void
security definer
set search_path = public, auth
as $$
declare
  caller_email text;
begin
  -- Check permission
  select email into caller_email from auth.users where id = auth.uid();
  if caller_email != 'neoyt@126.com' then
    raise exception 'Permission denied';
  end if;

  -- Double check it is indeed a zombie user (safety check)
  if exists (select 1 from public.profiles where user_id = target_user_id) or 
     exists (select 1 from public.admins where user_id = target_user_id) then
     raise exception 'Safety check failed: User has profile or is admin.';
  end if;

  -- Delete from auth.users
  delete from auth.users where id = target_user_id;
end;
$$ language plpgsql;
