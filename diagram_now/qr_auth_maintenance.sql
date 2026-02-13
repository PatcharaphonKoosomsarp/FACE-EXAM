-- QR Authentication maintenance script
-- Goal:
-- 1) Remove expired qr_authentication rows
-- 2) Remove stale rows (defensive cleanup)
-- 3) Provide optional scheduler setup via pg_cron

BEGIN;

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

-- Manual cleanup example:
-- SELECT public.cleanup_qr_authentication(24);

-- Optional scheduling with pg_cron (if available in your Supabase project):
-- 1) Enable extension (run once):
--    CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- 2) Schedule cleanup every 5 minutes:
--    SELECT cron.schedule(
--      'cleanup_qr_auth_every_5_min',
--      '*/5 * * * *',
--      $$SELECT public.cleanup_qr_authentication(24);$$
--    );
--
-- 3) Remove schedule:
--    SELECT cron.unschedule('cleanup_qr_auth_every_5_min');
