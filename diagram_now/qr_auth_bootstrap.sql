-- QR Authentication bootstrap (one-shot)
-- Includes:
-- 1) exam_id migration + indexes
-- 2) maintenance cleanup function
-- 3) optional pg_cron scheduling (safe + idempotent)

BEGIN;

-- 1) Schema hardening for exam-bound authentication
ALTER TABLE public.qr_authentication
ADD COLUMN IF NOT EXISTS exam_id uuid;

CREATE INDEX IF NOT EXISTS idx_qr_auth_user_exam_status_time
ON public.qr_authentication (user_id, exam_id, status, authenticated_at DESC);

CREATE INDEX IF NOT EXISTS idx_qr_auth_user_status_time
ON public.qr_authentication (user_id, status, authenticated_at DESC);

CREATE INDEX IF NOT EXISTS idx_qr_auth_expires_at
ON public.qr_authentication (expires_at);

CREATE INDEX IF NOT EXISTS idx_qr_auth_exam_id
ON public.qr_authentication (exam_id);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'exam_rooms'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'qr_authentication'
          AND constraint_name = 'fk_qr_auth_exam_id'
    ) THEN
        ALTER TABLE public.qr_authentication
        ADD CONSTRAINT fk_qr_auth_exam_id
        FOREIGN KEY (exam_id)
        REFERENCES public.exam_rooms(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- 2) Maintenance function
CREATE OR REPLACE FUNCTION public.cleanup_qr_authentication(
    p_max_age_hours integer DEFAULT 24
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted integer := 0;
BEGIN
    DELETE FROM public.qr_authentication
    WHERE
        (expires_at IS NOT NULL AND expires_at < NOW())
        OR authenticated_at < (NOW() - make_interval(hours => p_max_age_hours));

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_qr_authentication(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_qr_authentication(integer) TO authenticated, service_role;

COMMIT;

-- 3) Optional scheduler setup with pg_cron
--    Uncomment and run only if pg_cron is enabled in your project.
--
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--     IF NOT EXISTS (
--       SELECT 1 FROM cron.job WHERE jobname = 'cleanup_qr_auth_every_5_min'
--     ) THEN
--       PERFORM cron.schedule(
--         'cleanup_qr_auth_every_5_min',
--         '*/5 * * * *',
--         $$SELECT public.cleanup_qr_authentication(24);$$
--       );
--     END IF;
--   END IF;
-- END $$;
