-- =========================================================================
-- Riviera Health Spa - 마사지사 지정 배정 여부 컬럼 추가 마이그레이션
-- =========================================================================

ALTER TABLE public.reservations 
ADD COLUMN IF NOT EXISTS is_requested BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_requested_secondary BOOLEAN DEFAULT FALSE;
