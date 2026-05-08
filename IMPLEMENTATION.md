# Implementation Summary — File Uploads & Storage

## Overview
Completed implementation of file upload functionality across the hostel management app for join requests and resident profiles.

## Completed Tasks

### 1. Database Migrations (3 new migrations)
- **Migration 015**: Add `archived` value to `resident_status` enum
  - Enables archiving residents while preserving historical data
  
- **Migration 016**: Remove `complaints` table and `complaint_status` enum
  - Drops unused feature per user request
  
- **Migration 017**: Add file path columns to residents table
  - Adds: `photo_path`, `hostel_form_path`
  - Note: `aadhar_document_path` already added in migration 007

### 2. Storage Configuration (Bucket: `hostelrr-documents`)
**Storage path structure (RLS-protected):**
- Join request files: `join-requests/{hostel_id}/photo/{filename}`
- Join request files: `join-requests/{hostel_id}/aadhar/{filename}`
- Resident files: `residents/{hostel_id}/photo/{filename}`
- Resident files: `residents/{hostel_id}/aadhar/{filename}`
- Resident files: `residents/{hostel_id}/hostel-form/{filename}`

**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
**File size limit:** 5MB

### 3. Backend - supabaseAPI.ts
Added 5 new export functions:
- `uploadPhoto(file, hostelId, type)` — Upload photo to storage
- `uploadAadharDocument(file, hostelId, type)` — Upload aadhar/id document
- `uploadHostelForm(file, hostelId)` — Upload hostel intake form (residents only)
- `uploadResidentDocuments(files, hostelId)` — Batch upload for resident (photo, aadhar, form)
- `uploadJoinRequestDocuments(files, hostelId)` — Batch upload for join request (photo, aadhar)

All functions:
- Return full storage path after successful upload
- Throw descriptive errors if upload fails
- Support resumable uploads with unique filenames (timestamp prefix)

### 4. Frontend - JoinForm.tsx
**Changes:**
- Added file input for aadhar document (alongside existing photo input)
- Implemented pre-upload before RPC call
- Files are uploaded to storage, paths passed to `create_join_request` RPC
- Added file name display and success indicators
- Enhanced error handling with user-friendly toast messages

**Flow:**
1. User selects photo and/or aadhar file(s)
2. On submit, files upload to storage
3. Returned paths passed to `createJoinRequestDb` RPC
4. Join request created with file references

### 5. Frontend - Residents.tsx
**Changes:**
- Added file upload UI to resident edit modal
- Three file types: photo, aadhar document, hostel intake form
- File selection tracked in component state (`residentEditFiles`)
- Files uploaded before `editResident` call
- Upload paths passed to `editResident` function

**UI Features:**
- Drag-and-drop file inputs with visual feedback
- File name display after selection (with checkmark)
- Loading state during upload/save
- Cancel button clears selected files
- Toast notifications for success/errors

## Usage

### For Join Requests (Public)
1. User opens JoinForm via QR code
2. Fills details + optionally uploads photo and aadhar
3. Form submits: uploads files → creates join request with file paths

### For Resident Profiles (Owner)
1. Owner opens resident profile
2. Clicks "Edit" button
3. Optionally uploads: photo, aadhar, hostel form
4. Saves: uploads files → updates resident with paths

## Storage & RLS
- Files stored in `hostelrr-documents` bucket
- RLS policies ensure:
  - Owners can only access files in their hostel's folders
  - Join requests can upload to any hostel (public flow)
  - Residents can only access their own hostel's resident folder

## Error Handling
- Network/upload failures → descriptive toast messages
- File size > 5MB → rejected by bucket policy
- Invalid MIME types → rejected by bucket policy
- All errors propagated to UI with user-friendly text

## Next Steps (Optional Enhancements)
1. **File preview** — Display uploaded images/documents in resident profile
2. **File download** — Allow downloading stored documents
3. **Virus scanning** — Integrate antivirus API for uploads
4. **Document expiration** — Auto-delete files after N days
5. **File versioning** — Keep upload history per resident

## Database Diagram (Post-Migration)
```
residents table (partial):
- id, name, phone, aadhar_number (existing)
+ photo_path (NEW)
+ aadhar_document_path (from 007)
+ hostel_form_path (NEW)

join_requests table (existing):
- photo_path (accepts file upload path)
- aadhar_document_path (accepts file upload path)

hostels enum:
- resident_status: 'active' | 'left' | 'archived' (NEW)
```

## Files Modified
- `src/lib/supabaseAPI.ts` — Added 5 upload helper functions
- `src/pages/JoinForm.tsx` — Wired file uploads before RPC
- `src/pages/Residents.tsx` — Added file upload UI to edit modal
- `supabase/migrations/015_*.sql` — Add archived enum
- `supabase/migrations/016_*.sql` — Drop complaints
- `supabase/migrations/017_*.sql` — Add file path columns

## Verification
- TypeScript compilation: No new errors introduced
- File upload functions tested with mock files
- RLS policies validated for bucket access
- UI components render without errors
