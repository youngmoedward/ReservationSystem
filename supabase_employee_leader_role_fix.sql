-- =========================================================================
-- Riviera Health Spa 예약 시스템 - 직원 역할(leader) 추가 마이그레이션
-- =========================================================================

-- 1. 기존의 employee 테이블의 role CHECK 제약 조건 제거
ALTER TABLE public.employee DROP CONSTRAINT IF EXISTS employee_role_check;

-- 2. 'leader' 역할이 포함된 새로운 CHECK 제약 조건 추가
ALTER TABLE public.employee ADD CONSTRAINT employee_role_check CHECK (role IN ('manager', 'leader', 'staff'));
