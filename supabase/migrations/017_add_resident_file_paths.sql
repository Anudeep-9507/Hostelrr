-- =============================================================================
-- 017_add_resident_file_paths.sql
-- Add photo, aadhar, and hostel form document paths to residents table.
-- These reference files stored in the 'hostelrr-documents' bucket.
-- =============================================================================

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS photo_path TEXT,
  ADD COLUMN IF NOT EXISTS aadhar_document_path TEXT,
  ADD COLUMN IF NOT EXISTS hostel_form_path TEXT;

COMMENT ON COLUMN public.residents.photo_path IS 'Path to resident photo in storage bucket (residents/{hostel_id}/photo/{filename})';
COMMENT ON COLUMN public.residents.aadhar_document_path IS 'Path to aadhar document in storage bucket (residents/{hostel_id}/aadhar/{filename})';
COMMENT ON COLUMN public.residents.hostel_form_path IS 'Path to hostel intake form in storage bucket (residents/{hostel_id}/hostel-form/{filename})';
