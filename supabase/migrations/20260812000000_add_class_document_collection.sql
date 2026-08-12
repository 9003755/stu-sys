-- Private class document collection for criminal records and health declarations.
CREATE TABLE IF NOT EXISTS public.class_document_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL UNIQUE REFERENCES public.classes(id) ON DELETE CASCADE,
  access_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.class_document_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE SET NULL,
  submitted_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  match_status TEXT NOT NULL CHECK (match_status IN ('matched', 'pending')),
  criminal_record_path TEXT NOT NULL,
  health_declaration_path TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS class_document_submissions_unique_enrollment
  ON public.class_document_submissions(enrollment_id) WHERE enrollment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS class_document_submissions_class_status_idx
  ON public.class_document_submissions(class_id, match_status);
CREATE INDEX IF NOT EXISTS class_document_submissions_class_name_idx
  ON public.class_document_submissions(class_id, name_key);

INSERT INTO storage.buckets (id, name, public)
VALUES ('class-submission-documents', 'class-submission-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

ALTER TABLE public.class_document_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_document_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage own class document collections" ON public.class_document_collections;
CREATE POLICY "Admins manage own class document collections"
ON public.class_document_collections FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.admin_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.admin_id = auth.uid()));

DROP POLICY IF EXISTS "Admins manage own class document submissions" ON public.class_document_submissions;
CREATE POLICY "Admins manage own class document submissions"
ON public.class_document_submissions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.admin_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.admin_id = auth.uid()));

DROP POLICY IF EXISTS "Admins download own class documents" ON storage.objects;
CREATE POLICY "Admins download own class documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'class-submission-documents'
  AND EXISTS (SELECT 1 FROM public.classes c WHERE c.admin_id = auth.uid() AND c.id::text = split_part(name, '/', 1))
);

DROP POLICY IF EXISTS "Admins delete own class documents" ON storage.objects;
CREATE POLICY "Admins delete own class documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'class-submission-documents'
  AND EXISTS (SELECT 1 FROM public.classes c WHERE c.admin_id = auth.uid() AND c.id::text = split_part(name, '/', 1))
);

DROP POLICY IF EXISTS "Admins upload own class documents" ON storage.objects;
CREATE POLICY "Admins upload own class documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'class-submission-documents'
  AND EXISTS (SELECT 1 FROM public.classes c WHERE c.admin_id = auth.uid() AND c.id::text = split_part(name, '/', 1))
);

DROP POLICY IF EXISTS "Admins update own class documents" ON storage.objects;
CREATE POLICY "Admins update own class documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'class-submission-documents'
  AND EXISTS (SELECT 1 FROM public.classes c WHERE c.admin_id = auth.uid() AND c.id::text = split_part(name, '/', 1))
)
WITH CHECK (
  bucket_id = 'class-submission-documents'
  AND EXISTS (SELECT 1 FROM public.classes c WHERE c.admin_id = auth.uid() AND c.id::text = split_part(name, '/', 1))
);

CREATE OR REPLACE FUNCTION public.ensure_class_document_collection(target_class_id UUID)
RETURNS public.class_document_collections
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE collection public.class_document_collections;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = target_class_id AND admin_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to manage this class';
  END IF;
  INSERT INTO public.class_document_collections (class_id) VALUES (target_class_id)
  ON CONFLICT (class_id) DO UPDATE SET updated_at = timezone('utc', now())
  RETURNING * INTO collection;
  RETURN collection;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_class_document_collection(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_class_document_submission(
  target_id UUID,
  target_class_id UUID,
  target_enrollment_id UUID,
  target_submitted_name TEXT,
  target_name_key TEXT,
  target_criminal_record_path TEXT,
  target_health_declaration_path TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  previous public.class_document_submissions;
  next_status TEXT := CASE WHEN target_enrollment_id IS NULL THEN 'pending' ELSE 'matched' END;
BEGIN
  IF target_enrollment_id IS NOT NULL THEN
    SELECT * INTO previous FROM public.class_document_submissions
    WHERE class_id = target_class_id AND enrollment_id = target_enrollment_id
    FOR UPDATE;
  ELSE
    SELECT * INTO previous FROM public.class_document_submissions
    WHERE class_id = target_class_id AND name_key = target_name_key AND match_status = 'pending'
    ORDER BY submitted_at DESC LIMIT 1 FOR UPDATE;
  END IF;

  IF previous.id IS NOT NULL THEN
    DELETE FROM public.class_document_submissions WHERE id = previous.id;
  END IF;

  INSERT INTO public.class_document_submissions (
    id, class_id, enrollment_id, submitted_name, name_key, match_status,
    criminal_record_path, health_declaration_path
  ) VALUES (
    target_id, target_class_id, target_enrollment_id, target_submitted_name,
    target_name_key, next_status, target_criminal_record_path, target_health_declaration_path
  );

  RETURN jsonb_build_object(
    'status', next_status,
    'replaced_paths', CASE WHEN previous.id IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(previous.criminal_record_path, previous.health_declaration_path) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.replace_class_document_submission(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_class_document_submission(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_class_document_submission(target_submission_id UUID, target_enrollment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  target public.class_document_submissions;
  duplicate public.class_document_submissions;
BEGIN
  SELECT s INTO target FROM public.class_document_submissions s
  JOIN public.classes c ON c.id = s.class_id
  WHERE s.id = target_submission_id AND c.admin_id = auth.uid();
  IF target.id IS NULL THEN RAISE EXCEPTION 'Not authorized to manage this submission'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
    WHERE e.id = target_enrollment_id AND e.class_id = target.class_id AND c.admin_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Enrollment does not belong to this class'; END IF;

  SELECT s INTO duplicate FROM public.class_document_submissions s
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
  SELECT s INTO target FROM public.class_document_submissions s
  JOIN public.classes c ON c.id = s.class_id
  WHERE s.id = target_submission_id AND c.admin_id = auth.uid();
  IF target.id IS NULL THEN RAISE EXCEPTION 'Not authorized to delete this submission'; END IF;
  DELETE FROM public.class_document_submissions WHERE id = target_submission_id;
  RETURN target;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_class_document_submission(UUID) TO authenticated;
