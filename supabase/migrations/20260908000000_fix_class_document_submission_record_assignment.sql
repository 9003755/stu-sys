-- Fix composite-record assignment in class document admin RPCs.
-- `SELECT s INTO record_variable` assigns the composite value as one column;
-- `SELECT s.* INTO record_variable` assigns each table field correctly.

CREATE OR REPLACE FUNCTION public.resolve_class_document_submission(target_submission_id UUID, target_enrollment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  target public.class_document_submissions;
  duplicate public.class_document_submissions;
BEGIN
  SELECT s.* INTO target
  FROM public.class_document_submissions s
  JOIN public.classes c ON c.id = s.class_id
  WHERE s.id = target_submission_id AND c.admin_id = auth.uid();
  IF target.id IS NULL THEN RAISE EXCEPTION 'Not authorized to manage this submission'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
    WHERE e.id = target_enrollment_id AND e.class_id = target.class_id AND c.admin_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Enrollment does not belong to this class'; END IF;

  SELECT s.* INTO duplicate
  FROM public.class_document_submissions s
  WHERE s.enrollment_id = target_enrollment_id AND s.id <> target_submission_id;
  IF duplicate.id IS NOT NULL THEN DELETE FROM public.class_document_submissions WHERE id = duplicate.id; END IF;

  UPDATE public.class_document_submissions
  SET enrollment_id = target_enrollment_id,
      match_status = 'matched',
      submitted_name = (SELECT p.real_name FROM public.enrollments e JOIN public.profiles p ON p.id = e.profile_id WHERE e.id = target_enrollment_id),
      resolved_by = auth.uid(), resolved_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE id = target_submission_id RETURNING * INTO target;

  RETURN jsonb_build_object(
    'submission', to_jsonb(target),
    'replaced_paths', CASE WHEN duplicate.id IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(duplicate.criminal_record_path, duplicate.health_declaration_path) END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_class_document_submission(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_class_document_submission(target_submission_id UUID)
RETURNS public.class_document_submissions
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE target public.class_document_submissions;
BEGIN
  SELECT s.* INTO target
  FROM public.class_document_submissions s
  JOIN public.classes c ON c.id = s.class_id
  WHERE s.id = target_submission_id AND c.admin_id = auth.uid();
  IF target.id IS NULL THEN RAISE EXCEPTION 'Not authorized to delete this submission'; END IF;
  DELETE FROM public.class_document_submissions WHERE id = target_submission_id;
  RETURN target;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_class_document_submission(UUID) TO authenticated;
