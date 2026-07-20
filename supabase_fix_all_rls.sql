-- ====================================================================
-- 모든 테이블 데이터 조회를 위한 Supabase RLS (Row Level Security) 허용 SQL
-- ====================================================================
-- 참고: 취소자 블랙리스트는 별도의 'blacklists' 테이블이 없으며, 
-- 'reservations' 테이블의 취소 이력을 바탕으로 자동 집계됩니다.

-- 1. 직원 테이블 (employee)
ALTER TABLE public.employee ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on employee" ON public.employee;
CREATE POLICY "Allow all on employee" ON public.employee FOR ALL USING (true) WITH CHECK (true);

-- 2. 마사지사 테이블 (therapists)
ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on therapists" ON public.therapists;
CREATE POLICY "Allow all on therapists" ON public.therapists FOR ALL USING (true) WITH CHECK (true);

-- 3. 예약 테이블 (reservations - 블랙리스트 집계에도 사용됨)
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on reservations" ON public.reservations;
CREATE POLICY "Allow all on reservations" ON public.reservations FOR ALL USING (true) WITH CHECK (true);

-- 4. 요금제 테이블 (pricing_plans)
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on pricing_plans" ON public.pricing_plans;
CREATE POLICY "Allow all on pricing_plans" ON public.pricing_plans FOR ALL USING (true) WITH CHECK (true);

-- 5. 마사지사 요일별 우선순위 (therapist_priorities)
ALTER TABLE public.therapist_priorities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on therapist_priorities" ON public.therapist_priorities;
CREATE POLICY "Allow all on therapist_priorities" ON public.therapist_priorities FOR ALL USING (true) WITH CHECK (true);

-- 6. 마사지사 근무 일정 (therapist_schedule)
ALTER TABLE public.therapist_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on therapist_schedule" ON public.therapist_schedule;
CREATE POLICY "Allow all on therapist_schedule" ON public.therapist_schedule FOR ALL USING (true) WITH CHECK (true);

-- 7. 이력 로그 (reservation_logs)
ALTER TABLE public.reservation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on reservation_logs" ON public.reservation_logs;
CREATE POLICY "Allow all on reservation_logs" ON public.reservation_logs FOR ALL USING (true) WITH CHECK (true);

-- 8. 권한 계정 테이블 (system_roles)
ALTER TABLE public.system_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on system_roles" ON public.system_roles;
CREATE POLICY "Allow all on system_roles" ON public.system_roles FOR ALL USING (true) WITH CHECK (true);
