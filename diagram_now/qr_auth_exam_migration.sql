-- QR Authentication hardening migration
-- Goal:
-- 1) Bind mobile auth records to a specific exam via exam_id
-- 2) Speed up polling queries used by PC/mobile verification flow

BEGIN;

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

COMMIT;
