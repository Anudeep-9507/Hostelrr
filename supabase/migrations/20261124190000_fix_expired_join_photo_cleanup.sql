-- Avoid PL/pgSQL output-column ambiguity in the existing queue-returning RPC.
CREATE OR REPLACE FUNCTION public.claim_expired_join_photo_cleanup()
RETURNS TABLE(id BIGINT, object_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT j.id AS request_id, j.photo_path AS key
      FROM public.join_requests j
     WHERE j.photo_path IS NOT NULL
       AND ((j.status = 'rejected' AND j.reviewed_at < NOW() - INTERVAL '14 days')
         OR (j.status = 'pending' AND j.created_at < NOW() - INTERVAL '14 days'))
       AND NOT EXISTS (
         SELECT 1 FROM public.residents r WHERE r.photo_path = j.photo_path
       )
     FOR UPDATE OF j SKIP LOCKED
  ), detached AS (
    UPDATE public.join_requests j
       SET photo_path = NULL
      FROM eligible e
     WHERE j.id = e.request_id
    RETURNING e.key AS detached_key
  ), queued AS (
    INSERT INTO public.r2_photo_delete_queue(object_key, reason)
    SELECT d.detached_key, 'expired_join_request'
      FROM detached d
    ON CONFLICT DO NOTHING
    RETURNING r2_photo_delete_queue.id AS queue_id,
              r2_photo_delete_queue.object_key AS queue_key
  )
  SELECT q.queue_id, q.queue_key FROM queued q;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_expired_join_photo_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_join_photo_cleanup() TO service_role;
