-- =========================================================================
-- Riviera Health Spa 예약 시스템 - 요금제 관리 변경이력 중복 방지 마이그레이션
-- =========================================================================

-- 1. 기존 pricing_plans 테이블의 자동 이력 적재 트리거(trg_log_pricing_plan) 제거
--    (이제 프론트엔드 단에서 직접 PIN 정보를 획득하여 상세 수행자 로그를 정확하게 남깁니다)
DROP TRIGGER IF EXISTS trg_log_pricing_plan ON public.pricing_plans;

-- 2. 사용하지 않게 된 트리거 함수 삭제
DROP FUNCTION IF EXISTS log_pricing_plan_changes();
