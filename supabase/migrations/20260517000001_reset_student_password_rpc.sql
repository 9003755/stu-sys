create or replace function reset_student_password(target_user_id uuid, new_password text)
returns void
security definer
set search_path = public, auth, extensions
as $$
declare
  caller_id uuid;
  is_super boolean;
  can_manage boolean;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from public.admins
    where user_id = caller_id
      and admin_type = 'super'
  )
  into is_super;

  if is_super then
    can_manage := true;
  else
    if not exists (select 1 from public.admins where user_id = caller_id) then
      raise exception 'Permission denied';
    end if;

    if exists (select 1 from public.admins where user_id = target_user_id) then
      raise exception 'Permission denied';
    end if;

    select exists (
      select 1
      from public.enrollments e
      join public.classes c on c.id = e.class_id
      where e.user_id = target_user_id
        and c.admin_id = caller_id
    )
    into can_manage;

    if not can_manage then
      raise exception 'Permission denied';
    end if;
  end if;

  if new_password is null or length(new_password) < 6 or length(new_password) > 72 then
    raise exception 'Invalid password';
  end if;

  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf'))
  where id = target_user_id;

  if not found then
    raise exception 'User not found';
  end if;
end;
$$ language plpgsql;

grant execute on function reset_student_password(uuid, text) to authenticated;
grant execute on function reset_student_password(uuid, text) to service_role;
