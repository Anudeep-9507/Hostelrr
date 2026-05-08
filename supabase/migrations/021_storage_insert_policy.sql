-- =============================================================================
-- 021_storage_insert_policy.sql
-- Add explicit INSERT policy for residents folder using storage_object_hostel_id helper.
-- Fixes RLS error when uploading resident documents (aadhar, hostel form).
-- Depends on: 019_storage_object_hostel_match.sql
-- =============================================================================

-- Explicit INSERT policy using the robust storage_object_hostel_id helper function
CREATE POLICY "hostelrr_documents_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'hostelrr-documents'
    AND (
      -- residents folder: uploader must own the hostel
      (SPLIT_PART(name, '/', 1) = 'residents'
        AND public.user_owns_hostel(public.storage_object_hostel_id(name)))
      OR
      -- join-requests folder: hostel must exist (allows public uploads)
      (SPLIT_PART(name, '/', 1) = 'join-requests'
        AND EXISTS (SELECT 1 FROM public.hostels
                    WHERE id = public.storage_object_hostel_id(name)))
    )
  );
