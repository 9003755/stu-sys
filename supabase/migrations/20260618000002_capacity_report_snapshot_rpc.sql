create or replace function public.get_capacity_report_snapshot()
returns jsonb
security definer
set search_path = public, auth, storage
language plpgsql
as $$
declare
  v_admin_count bigint;
  v_class_count bigint;
  v_student_count bigint;
  v_database_used_bytes bigint;
  v_file_storage_used_bytes bigint;
  v_admins jsonb;
begin
  select count(*)::bigint
  into v_admin_count
  from public.admins;

  select count(*)::bigint
  into v_class_count
  from public.classes;

  select count(*)::bigint
  into v_student_count
  from auth.users u
  where not exists (
    select 1
    from public.admins a
    where a.user_id = u.id
  );

  select pg_database_size(current_database())::bigint
  into v_database_used_bytes;

  select coalesce(sum(nullif(o.metadata ->> 'size', '')::bigint), 0)::bigint
  into v_file_storage_used_bytes
  from storage.objects o
  where o.bucket_id = 'student-documents';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'admin_id', a.id,
        'user_id', a.user_id,
        'admin_name', coalesce(a.full_name, au.email, '未命名管理员'),
        'admin_email', au.email,
        'class_count', coalesce(admin_stats.class_count, 0),
        'classes', coalesce(admin_stats.classes, '[]'::jsonb)
      )
      order by a.created_at desc
    ),
    '[]'::jsonb
  )
  into v_admins
  from public.admins a
  left join auth.users au
    on au.id = a.user_id
  left join lateral (
    select
      count(*)::bigint as class_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'class_id', c.id,
            'class_name', c.name,
            'student_count', coalesce(class_counts.student_count, 0)
          )
          order by c.created_at desc
        ),
        '[]'::jsonb
      ) as classes
    from public.classes c
    left join lateral (
      select count(*)::bigint as student_count
      from public.enrollments e
      where e.class_id = c.id
    ) class_counts on true
    where c.admin_id = a.user_id
  ) admin_stats on true;

  return jsonb_build_object(
    'generated_at', now(),
    'database_used_bytes', v_database_used_bytes,
    'file_storage_used_bytes', v_file_storage_used_bytes,
    'admin_count', v_admin_count,
    'class_count', v_class_count,
    'student_count', v_student_count,
    'admins', v_admins
  );
end;
$$;

revoke all on function public.get_capacity_report_snapshot() from public;
grant execute on function public.get_capacity_report_snapshot() to service_role;
