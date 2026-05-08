# Storage Bucket RLS Setup — hostelrr-documents

## Bucket Configuration

**Bucket Name:** `hostelrr-documents`
**RLS:** Enabled

---

## RLS Policies

### Policy 1: Public INSERT to join-requests folder (unauthenticated)

**Type:** INSERT  
**Role:** All Users (includes public/unauthenticated)  
**Target:** Objects matching `join-requests/*`

**SQL:**
```sql
-- Policy: Allow public to insert join request documents
CREATE POLICY "Public can insert join-request documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'hostelrr-documents'
  AND (storage.foldername(name))[1] = 'join-requests'
);
```

---

### Policy 2: Owner INSERT to residents folder (authenticated)

**Type:** INSERT  
**Role:** Authenticated Users  
**Target:** Objects matching `residents/{hostel_id}/*`

**SQL:**
```sql
-- Policy: Owner can insert resident documents
CREATE POLICY "Owner can insert resident documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'hostelrr-documents'
  AND (storage.foldername(name))[1] = 'residents'
  AND (
    auth.uid() IN (
      SELECT user_id FROM hostels 
      WHERE id = (storage.foldername(name))[2]::uuid
    )
  )
);
```

---

### Policy 3: Owner SELECT from residents & join-requests folders

**Type:** SELECT  
**Role:** Authenticated Users  
**Target:** All objects in hostel's join-requests and residents folders

**SQL:**
```sql
-- Policy: Owner can view join-request and resident documents
CREATE POLICY "Owner can view hostel documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'hostelrr-documents'
  AND (
    -- For join-requests folder: owner of the hostel
    (
      (storage.foldername(name))[1] = 'join-requests'
      AND (
        auth.uid() IN (
          SELECT user_id FROM hostels 
          WHERE id = (storage.foldername(name))[2]::uuid
        )
      )
    )
    OR
    -- For residents folder: owner of the hostel
    (
      (storage.foldername(name))[1] = 'residents'
      AND (
        auth.uid() IN (
          SELECT user_id FROM hostels 
          WHERE id = (storage.foldername(name))[2]::uuid
        )
      )
    )
  )
);
```

---

## Setup Instructions

1. **Go to Supabase Dashboard** → Storage → `hostelrr-documents` bucket
2. **Click "Policies"** tab
3. **Delete any existing policies** that might be conflicting
4. **Click "Create Policy"** and paste each SQL policy above
5. **Test** by uploading a file from JoinForm

---

## Path Structure Reference

The upload functions use these paths:

```
join-requests/{hostel_id}/photo/{timestamp}-{filename}
join-requests/{hostel_id}/aadhar/{timestamp}-{filename}
residents/{hostel_id}/photo/{timestamp}-{filename}
residents/{hostel_id}/aadhar/{timestamp}-{filename}
residents/{hostel_id}/hostel-form/{timestamp}-{filename}
```

Each path is parsed by the policies using `(storage.foldername(name))[n]`:
- `[1]` = folder type (join-requests or residents)
- `[2]` = hostel_id (extracted from path)
- `[3]` = document type (photo, aadhar, hostel-form)
- `[4]` = filename

---

## Troubleshooting

**Error: "new row violates row-level security policy"**
- Ensure Policy 1 is created and enabled for public INSERT
- Verify bucket name is exactly `hostelrr-documents`
- Check that path matches pattern: `join-requests/{hostel_id}/...`

**Owner cannot view documents in dashboard**
- Ensure Policy 3 is created for SELECT
- Verify owner is authenticated (has valid JWT token)
- Check that hostel_id matches in path

**Files upload but cannot be downloaded**
- Ensure owner can SELECT from bucket (Policy 3)
- Verify user is authenticated when fetching signed URLs
- Check that `getSignedFileUrl()` is being called with valid auth session

---

## Test Checklist

- [ ] Public can upload photo to join-requests (no auth needed)
- [ ] Public can upload aadhar to join-requests (no auth needed)
- [ ] Owner can see join-request documents in Dashboard (auth required)
- [ ] Owner can upload to residents folder (auth required)
- [ ] Owner can view/download resident documents (auth required)
