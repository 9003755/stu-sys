-- Function to get overview of all students
-- Includes class info, admin info, and profile status
create or replace function get_all_students_overview()
returns table (
  student_id uuid,
  student_email text,
  student_name text,
  has_profile boolean,
  class_name text,
  admin_name text,
  registered_at timestamptz
)
security definer
set search_path = public, auth
as $$
declare
  caller_email text;
begin
  -- Permission check (super admin only)
  select email into caller_email from auth.users where id = auth.uid();
  if caller_email != 'neoyt@126.com' then
    raise exception 'Permission denied';
  end if;

  return query
  select 
    au.id as student_id,
    au.email::text as student_email,
    p.real_name as student_name,
    (p.id is not null) as has_profile,
    c.name as class_name,
    adm.full_name as admin_name,
    au.created_at as registered_at
  from auth.users au
  left join public.profiles p on au.id = p.user_id
  left join public.enrollments e on au.id = e.user_id
  left join public.classes c on e.class_id = c.id
  left join public.admins adm on c.admin_id = adm.user_id
  where 
    -- Exclude admins from the student list
    not exists (select 1 from public.admins where user_id = au.id)
  order by au.created_at desc;
end;
$$ language plpgsql;

grant execute on function get_all_students_overview() to authenticated;
grant execute on function get_all_students_overview() to service_role;
