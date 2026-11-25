-- Disposable production integration checks. Run as BEGIN; <file>; ROLLBACK;
-- Fixtures use one existing hostel and synthetic IDs/keys only.
DO $final_retention_tests$
DECLARE
  v_hostel UUID;
  v_owner UUID;
  v_room UUID;
  v_bed UUID;
  v_request UUID;
  v_resident UUID;
  v_join_key TEXT;
  v_photo_key TEXT;
  v_new_photo_key TEXT;
  v_retry_key TEXT;
  v_shared_key TEXT;
  v_queue_id BIGINT;
  v_claim UUID;
  v_disposition TEXT;
  v_attempts INTEGER;
  v_due TIMESTAMPTZ;
BEGIN
  SELECT h.id, rm.id, b.id, h.user_id
    INTO v_hostel, v_room, v_bed, v_owner
    FROM public.hostels h
    JOIN public.rooms rm ON rm.hostel_id = h.id
    JOIN public.beds b ON b.room_id = rm.id AND b.hostel_id = h.id AND b.status = 'vacant'
   LIMIT 1;
  IF v_hostel IS NULL THEN RAISE EXCEPTION 'No vacant bed is available for disposable fixtures'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::TEXT, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('app.approve_join_request_photo', 'on', true);

  -- 1. Decline removes request row and makes photo queue entry immediately due.
  v_request := gen_random_uuid();
  v_join_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  INSERT INTO public.join_requests(id, hostel_id, name, phone, photo_path)
  VALUES (v_request, v_hostel, 'Synthetic decline', 'test-' || v_request, v_join_key);
  PERFORM public.reject_join_request(v_request, 'Disposable lifecycle test');
  IF EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request)
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_join_key AND not_before <= NOW()) THEN
    RAISE EXCEPTION 'Declined request row/photo queue assertion failed';
  END IF;

  -- 2. Unanswered request stays before day 14. 3. Expired unanswered request is deleted.
  v_request := gen_random_uuid();
  v_join_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  INSERT INTO public.join_requests(id, hostel_id, name, phone, photo_path, created_at)
  VALUES (v_request, v_hostel, 'Synthetic recent', 'test-' || v_request, v_join_key, NOW() - INTERVAL '13 days');
  PERFORM public.claim_expired_join_photo_cleanup();
  IF NOT EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request)
     OR NOT EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request AND photo_path = v_join_key) THEN
    RAISE EXCEPTION 'Recent unanswered request/photo did not remain available';
  END IF;

  v_request := gen_random_uuid();
  v_join_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  INSERT INTO public.join_requests(id, hostel_id, name, phone, photo_path, created_at)
  VALUES (v_request, v_hostel, 'Synthetic expired', 'test-' || v_request, v_join_key, NOW() - INTERVAL '15 days');
  PERFORM public.claim_expired_join_photo_cleanup();
  IF EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request)
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_join_key AND not_before <= NOW()) THEN
    RAISE EXCEPTION 'Expired unanswered request/photo cleanup assertion failed';
  END IF;

  -- 4. Accepted request stays outside unanswered cleanup.
  v_request := gen_random_uuid();
  v_join_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  INSERT INTO public.join_requests(id, hostel_id, name, phone, photo_path, status, created_at)
  VALUES (v_request, v_hostel, 'Synthetic accepted', 'test-' || v_request, v_join_key, 'approved', NOW() - INTERVAL '30 days');
  PERFORM public.claim_expired_join_photo_cleanup();
  IF NOT EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request AND photo_path = v_join_key) THEN
    RAISE EXCEPTION 'Accepted request was removed by unanswered cleanup';
  END IF;

  -- 5. Resident departing today remains with photo. 6. Expired resident without
  -- finance references is physically purged and queues its photo.
  v_resident := gen_random_uuid();
  v_photo_key := format('residents/%s/%s/%s.png', v_hostel, v_resident, gen_random_uuid());
  INSERT INTO public.residents(id, hostel_id, room_id, bed_id, name, phone, join_date,
    actual_leave_date, monthly_rent, status, photo_path)
  VALUES (v_resident, v_hostel, v_room, v_bed, 'Synthetic current leaver', 'test-' || v_resident,
    CURRENT_DATE - 30, CURRENT_DATE, 1000, 'left', v_photo_key);
  UPDATE public.beds SET status = 'vacant' WHERE id = v_bed;
  v_request := gen_random_uuid();
  v_join_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  INSERT INTO public.join_requests(id, hostel_id, name, phone, status, photo_path, resident_id)
  VALUES (v_request, v_hostel, 'Synthetic retained accepted request', 'test-' || v_request, 'approved', v_join_key, v_resident);
  PERFORM public.purge_expired_resident_history();
  IF NOT EXISTS (SELECT 1 FROM public.residents WHERE id = v_resident AND photo_path = v_photo_key) THEN
    RAISE EXCEPTION 'Resident left within two calendar months was purged';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request AND photo_path = v_join_key) THEN
    RAISE EXCEPTION 'Accepted request/photo was removed before resident retention expired';
  END IF;

  v_resident := gen_random_uuid();
  v_photo_key := format('residents/%s/%s/%s.png', v_hostel, v_resident, gen_random_uuid());
  INSERT INTO public.residents(id, hostel_id, room_id, bed_id, name, phone, join_date,
    actual_leave_date, monthly_rent, status, photo_path)
  VALUES (v_resident, v_hostel, v_room, v_bed, 'Synthetic expired leaver', 'test-' || v_resident,
    CURRENT_DATE - 120, CURRENT_DATE - 90, 1000, 'left', v_photo_key);
  UPDATE public.beds SET status = 'vacant' WHERE id = v_bed;
  v_request := gen_random_uuid();
  v_join_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  INSERT INTO public.join_requests(id, hostel_id, name, phone, status, photo_path, resident_id)
  VALUES (v_request, v_hostel, 'Synthetic expired accepted request', 'test-' || v_request, 'approved', v_join_key, v_resident);
  PERFORM public.purge_expired_resident_history();
  IF EXISTS (SELECT 1 FROM public.residents WHERE id = v_resident)
     OR EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request)
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_photo_key)
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_join_key) THEN
    RAISE EXCEPTION 'Expired resident purge/photo queue assertion failed';
  END IF;

  -- 7. Manual history delete removes resident and queues photo.
  v_resident := gen_random_uuid();
  v_photo_key := format('residents/%s/%s/%s.png', v_hostel, v_resident, gen_random_uuid());
  INSERT INTO public.residents(id, hostel_id, room_id, bed_id, name, phone, join_date,
    actual_leave_date, monthly_rent, status, photo_path)
  VALUES (v_resident, v_hostel, v_room, v_bed, 'Synthetic manual delete', 'test-' || v_resident,
    CURRENT_DATE - 60, CURRENT_DATE - 1, 1000, 'left', v_photo_key);
  UPDATE public.beds SET status = 'vacant' WHERE id = v_bed;
  v_request := gen_random_uuid();
  v_join_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  INSERT INTO public.join_requests(id, hostel_id, name, phone, status, photo_path, resident_id)
  VALUES (v_request, v_hostel, 'Synthetic deleted accepted request', 'test-' || v_request, 'approved', v_join_key, v_resident);
  v_disposition := public.delete_past_resident(v_resident);
  IF v_disposition <> 'deleted' OR EXISTS (SELECT 1 FROM public.residents WHERE id = v_resident)
     OR EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request)
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_photo_key)
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_join_key) THEN
    RAISE EXCEPTION 'Manual history deletion assertion failed';
  END IF;

  -- Finance dependency keeps accounting rows and strips resident PII/photo.
  v_resident := gen_random_uuid();
  INSERT INTO public.residents(id, hostel_id, room_id, bed_id, name, phone, emergency_contact,
    aadhar_number, area_and_city, state, country, join_date, actual_leave_date, monthly_rent, status)
  VALUES (v_resident, v_hostel, v_room, v_bed, 'Synthetic finance resident', 'test-' || v_resident,
    'synthetic emergency', 'synthetic id', 'synthetic city', 'synthetic state', 'synthetic country',
    CURRENT_DATE - 100, CURRENT_DATE - 90, 1000, 'left');
  UPDATE public.beds SET status = 'vacant' WHERE id = v_bed;
  INSERT INTO public.payment_cycles(resident_id, hostel_id, cycle_start, cycle_end, due_date, total_amount)
  VALUES (v_resident, v_hostel, CURRENT_DATE - 30, CURRENT_DATE - 1, CURRENT_DATE, 1000);
  v_request := gen_random_uuid();
  v_join_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  INSERT INTO public.join_requests(id, hostel_id, name, phone, status, photo_path, resident_id)
  VALUES (v_request, v_hostel, 'Synthetic finance accepted request', 'test-' || v_request, 'approved', v_join_key, v_resident);
  v_disposition := public.delete_past_resident(v_resident);
  IF v_disposition <> 'anonymized'
     OR NOT EXISTS (SELECT 1 FROM public.residents WHERE id = v_resident AND personal_data_deleted_at IS NOT NULL
       AND name = 'Deleted resident' AND phone = 'deleted-' || replace(v_resident::TEXT, '-', '')
       AND emergency_contact IS NULL AND aadhar_number IS NULL AND area_and_city IS NULL
       AND state IS NULL AND country IS NULL AND photo_path IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.payment_cycles WHERE resident_id = v_resident)
     OR EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request)
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_join_key) THEN
    RAISE EXCEPTION 'Finance retention/anonymization assertion failed';
  END IF;

  -- 8. Replacement queues old key, preserves new key, and clears accepted duplicate.
  v_resident := gen_random_uuid();
  v_request := gen_random_uuid();
  v_photo_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  v_new_photo_key := format('residents/%s/%s/%s.png', v_hostel, v_resident, gen_random_uuid());
  INSERT INTO public.residents(id, hostel_id, room_id, bed_id, name, phone, join_date,
    actual_leave_date, monthly_rent, status, photo_path)
  VALUES (v_resident, v_hostel, v_room, v_bed, 'Synthetic replace', 'test-' || v_resident,
    CURRENT_DATE - 60, CURRENT_DATE - 1, 1000, 'left', v_photo_key);
  UPDATE public.beds SET status = 'vacant' WHERE id = v_bed;
  INSERT INTO public.join_requests(id, hostel_id, name, phone, status, photo_path, resident_id)
  VALUES (v_request, v_hostel, 'Synthetic accepted link', 'test-' || v_request, 'approved', v_photo_key, v_resident);
  UPDATE public.residents SET photo_path = v_new_photo_key WHERE id = v_resident;
  IF NOT EXISTS (SELECT 1 FROM public.residents WHERE id = v_resident AND photo_path = v_new_photo_key)
     OR NOT EXISTS (SELECT 1 FROM public.join_requests WHERE id = v_request AND photo_path IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_photo_key) THEN
    RAISE EXCEPTION 'Photo replacement/accepted reference assertion failed';
  END IF;

  -- 9. Removal queues photo and keeps resident.
  v_resident := gen_random_uuid();
  v_photo_key := format('residents/%s/%s/%s.png', v_hostel, v_resident, gen_random_uuid());
  INSERT INTO public.residents(id, hostel_id, room_id, bed_id, name, phone, join_date,
    monthly_rent, status, photo_path)
  VALUES (v_resident, v_hostel, v_room, v_bed, 'Synthetic remove', 'test-' || v_resident,
    CURRENT_DATE, 1000, 'left', v_photo_key);
  UPDATE public.beds SET status = 'vacant' WHERE id = v_bed;
  UPDATE public.residents SET photo_path = NULL WHERE id = v_resident;
  IF NOT EXISTS (SELECT 1 FROM public.residents WHERE id = v_resident AND photo_path IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_photo_key) THEN
    RAISE EXCEPTION 'Photo removal assertion failed';
  END IF;

  -- 10. Failed delete records retry state. 11. Shared valid reference blocks claim.
  v_retry_key := format('residents/%s/%s/%s.png', v_hostel, gen_random_uuid(), gen_random_uuid());
  PERFORM public.enqueue_r2_photo_delete(v_retry_key, 'disposable_retention_test');
  SELECT c.id, c.claim_token INTO v_queue_id, v_claim
    FROM public.claim_r2_photo_delete_queue(200) c WHERE c.object_key = v_retry_key;
  IF v_queue_id IS NULL OR NOT public.finish_r2_photo_delete(v_queue_id, v_claim, FALSE, 'synthetic failure') THEN
    RAISE EXCEPTION 'Queue retry fixture could not be claimed or failed';
  END IF;
  SELECT attempt_count, next_attempt_at INTO v_attempts, v_due
    FROM public.r2_photo_delete_queue WHERE id = v_queue_id;
  IF v_attempts <> 1 OR v_due <= NOW()
     OR NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE id = v_queue_id AND last_error = 'synthetic failure') THEN
    RAISE EXCEPTION 'Failed delete did not persist retry state';
  END IF;

  v_resident := gen_random_uuid();
  v_shared_key := format('residents/%s/%s/%s.png', v_hostel, v_resident, gen_random_uuid());
  INSERT INTO public.residents(id, hostel_id, room_id, bed_id, name, phone, join_date,
    monthly_rent, status, photo_path)
  VALUES (v_resident, v_hostel, v_room, v_bed, 'Synthetic shared key', 'test-' || v_resident,
    CURRENT_DATE, 1000, 'left', v_shared_key);
  UPDATE public.beds SET status = 'vacant' WHERE id = v_bed;
  PERFORM public.enqueue_r2_photo_delete(v_shared_key, 'disposable_shared_reference_test');
  IF EXISTS (SELECT 1 FROM public.claim_r2_photo_delete_queue(200) c WHERE c.object_key = v_shared_key) THEN
    RAISE EXCEPTION 'Shared referenced photo was claimed for deletion';
  END IF;

  -- Pending manual removal still respects submission-time expiry.
  v_request := gen_random_uuid();
  v_join_key := format('join-requests/%s/%s/%s.png', v_hostel, v_request, gen_random_uuid());
  INSERT INTO public.join_requests(id, hostel_id, name, phone, photo_path, created_at)
  VALUES (v_request, v_hostel, 'Synthetic manual removal', 'test-' || v_request, v_join_key, NOW() - INTERVAL '1 day');
  DELETE FROM public.join_requests WHERE id = v_request;
  IF NOT EXISTS (SELECT 1 FROM public.r2_photo_delete_queue WHERE object_key = v_join_key
    AND not_before >= NOW() + INTERVAL '12 days') THEN
    RAISE EXCEPTION 'Manual pending request removal did not preserve 14-day photo retention';
  END IF;
END;
$final_retention_tests$;
