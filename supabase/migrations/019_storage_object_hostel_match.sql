-- =============================================================================
-- 019_storage_object_hostel_match.sql
-- Robust storage object ownership helper and select policy for document previews.
-- Depends on: 007_join_requests_storage.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.storage_object_hostel_id(object_name TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT folder::UUID
  FROM unnest(storage.foldername(object_name)) AS folder
  WHERE folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  LIMIT 1;
$$;

CREATE POLICY "hostelrr_documents_owner_select_by_path"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'hostelrr-documents'
    AND public.user_owns_hostel(public.storage_object_hostel_id(name))
  );

CREATE POLICY "hostelrr_documents_owner_delete_by_path"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'hostelrr-documents'
    AND public.user_owns_hostel(public.storage_object_hostel_id(name))
  );
