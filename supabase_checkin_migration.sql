-- =========================================================================
-- Riviera Health Spa 예약 시스템 - 라커키 체크인 기능 추가 마이그레이션
-- =========================================================================

-- 1. reservations 테이블에 체크인 여부 및 라커 번호 컬럼 추가
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS is_checked_in BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS locker_number TEXT DEFAULT NULL;

-- 2. RLS 정책 검사 (기존 RLS 정책이 reservations 테이블 전체 컬럼에 작용하므로 신설 컬럼도 안전하게 승계됨)
-- RLS 정책 확인용 주석:
-- ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
