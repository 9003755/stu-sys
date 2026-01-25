-- Create storage bucket for student documents
INSERT INTO storage.buckets (id, name, public) VALUES ('student-documents', 'student-documents', true);

-- Policy: Authenticated users can upload files
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'student-documents' );

-- Policy: Users can update their own files (based on naming convention or owner_id if we tracked it, but for simplicity we allow update if auth)
CREATE POLICY "Authenticated users can update files"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'student-documents' );

-- Policy: Users can view files (Public for now as we set public=true, but ideally should be restricted. For MVP we use public URLs for easier display)
CREATE POLICY "Anyone can view files"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'student-documents' );
