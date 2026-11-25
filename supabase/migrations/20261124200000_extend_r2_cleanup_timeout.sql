-- Allow a full bounded cleanup batch to finish before pg_net gives up waiting.
DO $$
DECLARE v_job_id BIGINT;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'r2-photo-cleanup-every-5-minutes'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'r2-photo-cleanup-every-5-minutes',
    '*/5 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://lfgouwvdwxlkirqqlwmt.supabase.co/functions/v1/resident-photo',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
             WHERE name = 'r2_photo_cleanup_token' LIMIT 1
          )
        ),
        body := '{"action":"cleanup"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );
END;
$$;
