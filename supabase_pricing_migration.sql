-- 0. 예약 테이블의 취소 유형 제약 조건 갱신 (정상 취소 옵션 허용)
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_cancellation_check;
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_cancellation_type_check;

ALTER TABLE public.reservations ADD CONSTRAINT reservations_cancellation_check CHECK (
  (status = 'confirmed' AND cancellation_type IS NULL AND penalty_points = 0)
  OR
  (status = 'cancelled' AND cancellation_type = 'request' AND penalty_points = 1)
  OR
  (status = 'cancelled' AND cancellation_type = 'noshow' AND penalty_points = 3)
  OR
  (status = 'cancelled' AND cancellation_type = 'normal' AND penalty_points = 0)
);

-- 기존 중복 데이터가 있으면 1개만 남기고 삭제
DELETE FROM public.pricing_plans a 
USING public.pricing_plans b 
WHERE a.id > b.id AND a.name = b.name;

-- 요금명(name) 컬럼 고유(UNIQUE) 제약 조건 추가
ALTER TABLE public.pricing_plans DROP CONSTRAINT IF EXISTS pricing_plans_name_key;
ALTER TABLE public.pricing_plans ADD CONSTRAINT pricing_plans_name_key UNIQUE (name);

-- A. 요금제 테이블 생성
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  duration_minutes INT NOT NULL, -- 서비스 시간 (분 단위)
  weight NUMERIC DEFAULT 1.0 NOT NULL, -- 가중치
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- B. 마사지사 일별 포인트 집계 테이블 생성
CREATE TABLE IF NOT EXISTS public.therapist_daily_points (
  id SERIAL PRIMARY KEY,
  therapist_id INT REFERENCES public.therapists(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  points NUMERIC DEFAULT 0.0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT therapist_daily_points_unique UNIQUE(therapist_id, date)
);

-- C. 예약 테이블 요금제 연결 외래키 추가
ALTER TABLE public.reservations 
  ADD COLUMN IF NOT EXISTS pricing_plan_id INT REFERENCES public.pricing_plans(id) ON DELETE SET NULL;

-- D. RLS 활성화 및 권한 분기 적용
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_daily_points ENABLE ROW LEVEL SECURITY;

-- pricing_plans RLS 정책
DROP POLICY IF EXISTS select_pricing_plans ON public.pricing_plans;
CREATE POLICY select_pricing_plans ON public.pricing_plans
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS modify_pricing_plans ON public.pricing_plans;
CREATE POLICY modify_pricing_plans ON public.pricing_plans
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- therapist_daily_points RLS 정책
DROP POLICY IF EXISTS select_therapist_points ON public.therapist_daily_points;
CREATE POLICY select_therapist_points ON public.therapist_daily_points
  FOR SELECT TO authenticated 
  USING (public.is_employee(auth.uid()) OR public.is_therapist_self(auth.uid(), therapist_id));

DROP POLICY IF EXISTS modify_therapist_points ON public.therapist_daily_points;
CREATE POLICY modify_therapist_points ON public.therapist_daily_points
  FOR ALL TO authenticated USING (public.is_employee(auth.uid()));

-- E. 요금제 수정/삭제 시 변경 이력 자동 적재 트리거
CREATE OR REPLACE FUNCTION log_pricing_plan_changes()
RETURNS TRIGGER AS $$
DECLARE
  performer_uuid UUID;
  changes TEXT[] := ARRAY[]::TEXT[];
  details_text TEXT;
BEGIN
  performer_uuid := auth.uid();
  
  IF (TG_OP = 'UPDATE') THEN
    -- 변경 여부 정밀 확인 및 변경된 필드만 추출
    IF OLD.name IS DISTINCT FROM NEW.name THEN
      changes := array_append(changes, '이름: ' || OLD.name || ' -> ' || NEW.name);
    END IF;
    
    IF OLD.price IS DISTINCT FROM NEW.price THEN
      changes := array_append(changes, '금액: ' || OLD.price || ' -> ' || NEW.price);
    END IF;
    
    IF OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes THEN
      changes := array_append(changes, '시간: ' || OLD.duration_minutes || '분 -> ' || NEW.duration_minutes || '분');
    END IF;
    
    IF OLD.weight IS DISTINCT FROM NEW.weight THEN
      changes := array_append(changes, '가중치: ' || to_char(OLD.weight, 'FM990.0') || ' -> ' || to_char(NEW.weight, 'FM990.0'));
    END IF;

    -- 변경 사항이 있는 경우에만 로그 적재
    IF array_length(changes, 1) > 0 THEN
      details_text := '요금제 [' || OLD.name || '] 정보 변경. ' || array_to_string(changes, ', ');
      
      INSERT INTO public.reservation_logs (log_type, action, performed_by, details)
      VALUES ('pricing', 'update', performer_uuid, details_text);
    END IF;
    
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.reservation_logs (log_type, action, performed_by, details)
    VALUES (
      'pricing',
      'delete',
      performer_uuid,
      '요금제 [' || OLD.name || '] (금액: ' || OLD.price || ') 삭제함.'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_pricing_plan ON public.pricing_plans;
CREATE TRIGGER trg_log_pricing_plan
AFTER UPDATE OR DELETE ON public.pricing_plans
FOR EACH ROW EXECUTE FUNCTION log_pricing_plan_changes();

-- F. 예약의 변동(CUD)이 생길 때 마사지사 일별 포인트를 갱신하는 실시간 트리거
CREATE OR REPLACE FUNCTION public.sync_therapist_daily_points()
RETURNS TRIGGER AS $$
DECLARE
  target_therapist_id INT;
  target_date DATE;
  old_therapist_id INT;
  old_date DATE;
BEGIN
  -- 1. INSERT / UPDATE 시 새 상태 반영
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    target_therapist_id := NEW.therapist_id;
    target_date := DATE(NEW.start_time AT TIME ZONE 'Asia/Seoul');
    
    IF (target_therapist_id IS NOT NULL AND target_date IS NOT NULL) THEN
      INSERT INTO public.therapist_daily_points (therapist_id, date, points, updated_at)
      SELECT 
        r.therapist_id,
        DATE(r.start_time AT TIME ZONE 'Asia/Seoul') as d_date,
        COALESCE(SUM(r.price * COALESCE(p.weight, 1.0)), 0) as total_points,
        NOW()
      FROM public.reservations r
      LEFT JOIN public.pricing_plans p ON r.pricing_plan_id = p.id
      WHERE r.therapist_id = target_therapist_id 
        AND DATE(r.start_time AT TIME ZONE 'Asia/Seoul') = target_date
        AND r.status = 'confirmed'
      GROUP BY r.therapist_id, d_date
      ON CONFLICT (therapist_id, date) 
      DO UPDATE SET 
        points = EXCLUDED.points,
        updated_at = NOW();
    END IF;
  END IF;

  -- 2. UPDATE 시 기존 상태 (마사지사 혹은 날짜가 변경되었을 경우 이전 상태 재합산)
  IF (TG_OP = 'UPDATE') THEN
    old_therapist_id := OLD.therapist_id;
    old_date := DATE(OLD.start_time AT TIME ZONE 'Asia/Seoul');
    
    IF (old_therapist_id IS NOT NULL AND old_date IS NOT NULL 
        AND (old_therapist_id != COALESCE(NEW.therapist_id, -1) OR old_date != COALESCE(DATE(NEW.start_time AT TIME ZONE 'Asia/Seoul'), '1970-01-01'::DATE))) THEN
      INSERT INTO public.therapist_daily_points (therapist_id, date, points, updated_at)
      SELECT 
        r.therapist_id,
        DATE(r.start_time AT TIME ZONE 'Asia/Seoul') as d_date,
        COALESCE(SUM(r.price * COALESCE(p.weight, 1.0)), 0) as total_points,
        NOW()
      FROM public.reservations r
      LEFT JOIN public.pricing_plans p ON r.pricing_plan_id = p.id
      WHERE r.therapist_id = old_therapist_id 
        AND DATE(r.start_time AT TIME ZONE 'Asia/Seoul') = old_date
        AND r.status = 'confirmed'
      GROUP BY r.therapist_id, d_date
      ON CONFLICT (therapist_id, date) 
      DO UPDATE SET 
        points = EXCLUDED.points,
        updated_at = NOW();
    END IF;
  END IF;

  -- 3. DELETE 시 기존 상태 제거/갱신
  IF (TG_OP = 'DELETE') THEN
    old_therapist_id := OLD.therapist_id;
    old_date := DATE(OLD.start_time AT TIME ZONE 'Asia/Seoul');
    
    IF (old_therapist_id IS NOT NULL AND old_date IS NOT NULL) THEN
      INSERT INTO public.therapist_daily_points (therapist_id, date, points, updated_at)
      SELECT 
        r.therapist_id,
        DATE(r.start_time AT TIME ZONE 'Asia/Seoul') as d_date,
        COALESCE(SUM(r.price * COALESCE(p.weight, 1.0)), 0) as total_points,
        NOW()
      FROM public.reservations r
      LEFT JOIN public.pricing_plans p ON r.pricing_plan_id = p.id
      WHERE r.therapist_id = old_therapist_id 
        AND DATE(r.start_time AT TIME ZONE 'Asia/Seoul') = old_date
        AND r.status = 'confirmed'
      GROUP BY r.therapist_id, d_date
      ON CONFLICT (therapist_id, date) 
      DO UPDATE SET 
        points = EXCLUDED.points,
        updated_at = NOW();
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_therapist_points ON public.reservations;
CREATE TRIGGER trg_sync_therapist_points
AFTER INSERT OR UPDATE OR DELETE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.sync_therapist_daily_points();

-- G. 요구사항 기반 기본 요금제 더미 데이터 주입
INSERT INTO public.pricing_plans (name, description, price, duration_minutes, weight) VALUES
  ('Basic Swedish Care', '60-minute basic full body relaxation massage', 80, 60, 1.0),
  ('Essential Aroma Massage', '90-minute customized essential hot stone massage', 100, 90, 1.2),
  ('Imperial Full Body Thai', '120-minute VIP full body acupressure treatment', 120, 120, 1.5),
  ('Luxury Deep Care', '150-minute premium healing spa massage', 150, 150, 1.8),
  ('Royal Healing Therapy', '180-minute master signature deep flow massage', 180, 180, 2.0)
ON CONFLICT (name) DO NOTHING;

-- H. therapists 테이블에 마사지 속성(massage_type: dry, wet, both) 컬럼 추가
ALTER TABLE public.therapists 
  ADD COLUMN IF NOT EXISTS massage_type TEXT DEFAULT 'both';

-- I. pricing_plans 테이블에 마사지 유형(category: dry, wet, combo) 및 습식/건식 세부 요금/시간/가중치 컬럼 추가
ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'combo',
  ADD COLUMN IF NOT EXISTS bath_price NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bath_duration_minutes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bath_weight NUMERIC(3,2) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS massage_price NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS massage_duration_minutes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS massage_weight NUMERIC(3,2) DEFAULT 1.0;


