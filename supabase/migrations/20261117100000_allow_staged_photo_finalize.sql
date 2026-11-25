-- The finalizer is SECURITY DEFINER, so current_user is the function owner
-- while the request role remains authenticated. Mark only this guarded write.
CREATE OR REPLACE FUNCTION public.finalize_resident_photo_upload_staged(
  p_upload_id UUID,
  p_user_id UUID,
  p_final_object_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.resident_photo_uploads%ROWTYPE;
BEGIN
  SELECT * INTO u FROM public.resident_photo_uploads WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR u.created_by<>p_user_id OR u.consumed_at IS NOT NULL
     OR u.aborted_at IS NOT NULL OR u.expires_at<=NOW()
     OR u.final_object_key IS DISTINCT FROM p_final_object_key THEN
    RETURN FALSE;
  END IF;

  PERFORM 1 FROM public.residents
    WHERE id=u.resident_id AND hostel_id=u.hostel_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  PERFORM set_config('app.approve_join_request_photo','on',true);
  UPDATE public.residents SET photo_path=p_final_object_key,updated_at=NOW()
    WHERE id=u.resident_id AND hostel_id=u.hostel_id;
  UPDATE public.resident_photo_uploads SET consumed_at=NOW() WHERE id=p_upload_id;
  PERFORM public.enqueue_r2_photo_delete(u.object_key,'resident_staging_promoted');
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_resident_photo_upload_staged(UUID,UUID,TEXT)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_resident_photo_upload_staged(UUID,UUID,TEXT)
  TO service_role;
