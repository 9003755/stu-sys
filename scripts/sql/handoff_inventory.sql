-- Student system handoff: read-only inventory (2026-10-12).
-- Run in the authorized Supabase SQL Editor, section by section.
-- No keys, names, uploaded paths, collection tokens, user rows or cron commands.
-- This is NOT a migration and does not prove backups/restores are operational.

SELECT now() AS checked_at, current_database() AS database_name,
       current_setting('server_version') AS postgres_version;

-- Presence first. A NULL result requires investigation, not schema recreation.
SELECT object_name, to_regclass(object_name) AS resolved_relation
FROM (VALUES
  ('public.profiles'), ('public.admins'), ('public.classes'),
  ('public.enrollments'), ('public.class_document_collections'),
  ('public.class_document_submissions'), ('public.super_audit_logs'),
  ('supabase_migrations.schema_migrations'), ('storage.buckets'),
  ('storage.objects'), ('cron.job'), ('cron.job_run_details'),
  ('net._http_response')
) AS expected(object_name);

SELECT table_name, ordinal_position, column_name, data_type, is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'admins', 'classes', 'enrollments',
    'class_document_collections', 'class_document_submissions', 'super_audit_logs')
ORDER BY table_name, ordinal_position;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

SELECT c.conrelid::regclass AS table_name, c.conname,
       c.contype, c.convalidated, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
ORDER BY c.conrelid::regclass::text, c.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname = 'public'
ORDER BY tablename, indexname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

-- Includes effective EXECUTE (including PUBLIC grants), not only explicit ACL.
SELECT p.oid::regprocedure AS function_signature,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
       p.proconfig AS function_settings, p.proacl AS explicit_acl,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
       md5(pg_get_functiondef(p.oid)) AS definition_comparison_digest
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
ORDER BY p.oid::regprocedure::text;

SELECT schemaname, relname, n_live_tup AS estimated_rows, last_analyze, last_autoanalyze
FROM pg_stat_user_tables WHERE schemaname IN ('public', 'auth', 'storage')
ORDER BY schemaname, relname;

SELECT extname, extversion FROM pg_extension ORDER BY extname;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets ORDER BY id;

SELECT bucket_id, count(*) AS object_count,
       sum(CASE WHEN metadata ->> 'size' ~ '^[0-9]+$'
                THEN (metadata ->> 'size')::numeric ELSE 0 END) AS recorded_bytes
FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id;

-- Optional blocks: uncomment individually only AFTER confirming relations/columns.
-- Manual SQL Editor changes may be absent from CLI migration history.
-- SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;

-- Avoid cron.job.command: it can contain bearer credentials.
-- SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
-- SELECT jobid, status, start_time, end_time
-- FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- SELECT id, status_code, timed_out, created
-- FROM net._http_response ORDER BY created DESC LIMIT 20;

-- Data consistency counts only; confirm core tables exist before uncommenting.
-- SELECT count(*) AS enrollment_user_profile_mismatches
-- FROM public.enrollments e JOIN public.profiles p ON p.id = e.profile_id
-- WHERE e.user_id IS DISTINCT FROM p.user_id;
-- SELECT count(*) AS matched_without_enrollment
-- FROM public.class_document_submissions
-- WHERE match_status = 'matched' AND enrollment_id IS NULL;
-- SELECT count(*) AS wrong_class_links
-- FROM public.class_document_submissions s
-- JOIN public.enrollments e ON e.id = s.enrollment_id
-- WHERE e.class_id IS DISTINCT FROM s.class_id;
-- SELECT count(*) AS missing_document_objects
-- FROM public.class_document_submissions s
-- CROSS JOIN LATERAL (VALUES (s.criminal_record_path), (s.health_declaration_path)) f(path)
-- LEFT JOIN storage.objects o ON o.bucket_id = 'class-submission-documents' AND o.name = f.path
-- WHERE o.id IS NULL;
