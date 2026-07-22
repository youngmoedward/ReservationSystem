-- 1. reservations 테이블에 secondary_therapist_id 컬럼 추가
ALTER TABLE public.reservations 
  ADD COLUMN IF NOT EXISTS secondary_therapist_id INT REFERENCES public.therapists(id) ON DELETE SET NULL;

-- 2. reservations RLS 정책 업데이트
DROP POLICY IF EXISTS select_reservations ON public.reservations;
CREATE POLICY select_reservations ON public.reservations
  FOR SELECT TO authenticated
  USING (
    public.is_employee(auth.uid()) OR 
    public.is_therapist_self(auth.uid(), therapist_id) OR
    public.is_therapist_self(auth.uid(), secondary_therapist_id)
  );

-- 3. 마사지사 일별 포인트 집계 트리거 함수 고도화 (콤보 요금제 지원)
CREATE OR REPLACE FUNCTION public.sync_therapist_daily_points()
RETURNS TRIGGER AS $$
DECLARE
  target_date DATE;
  old_date DATE;
BEGIN
  -- A. INSERT/UPDATE 시 새 마사지사들의 당일 포인트 갱신
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    target_date := DATE(NEW.start_time AT TIME ZONE 'Asia/Seoul');
    
    -- 주 마사지사(therapist_id) 포인트 갱신
    IF (NEW.therapist_id IS NOT NULL AND target_date IS NOT NULL) THEN
      PERFORM public.recalculate_therapist_points(NEW.therapist_id, target_date);
    END IF;
    
    -- 보조 마사지사(secondary_therapist_id) 포인트 갱신
    IF (NEW.secondary_therapist_id IS NOT NULL AND target_date IS NOT NULL) THEN
      PERFORM public.recalculate_therapist_points(NEW.secondary_therapist_id, target_date);
    END IF;
  END IF;

  -- B. UPDATE 시 기존 마사지사 또는 변경 전 날짜의 포인트 재갱신
  IF (TG_OP = 'UPDATE') THEN
    old_date := DATE(OLD.start_time AT TIME ZONE 'Asia/Seoul');
    
    -- 변경 전 주 마사지사 포인트 갱신
    IF (OLD.therapist_id IS NOT NULL AND old_date IS NOT NULL 
        AND (OLD.therapist_id != COALESCE(NEW.therapist_id, -1) OR old_date != target_date)) THEN
      PERFORM public.recalculate_therapist_points(OLD.therapist_id, old_date);
    END IF;

    -- 변경 전 보조 마사지사 포인트 갱신
    IF (OLD.secondary_therapist_id IS NOT NULL AND old_date IS NOT NULL 
        AND (OLD.secondary_therapist_id != COALESCE(NEW.secondary_therapist_id, -1) OR old_date != target_date)) THEN
      PERFORM public.recalculate_therapist_points(OLD.secondary_therapist_id, old_date);
    END IF;
  END IF;

  -- C. DELETE 시 기존 마사지사들의 포인트 갱신
  IF (TG_OP = 'DELETE') THEN
    old_date := DATE(OLD.start_time AT TIME ZONE 'Asia/Seoul');
    
    IF (OLD.therapist_id IS NOT NULL AND old_date IS NOT NULL) THEN
      PERFORM public.recalculate_therapist_points(OLD.therapist_id, old_date);
    END IF;
    
    IF (OLD.secondary_therapist_id IS NOT NULL AND old_date IS NOT NULL) THEN
      PERFORM public.recalculate_therapist_points(OLD.secondary_therapist_id, old_date);
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 특정 마사지사의 특정 일자 포인트를 정산하는 공통 서브 헬퍼 함수
CREATE OR REPLACE FUNCTION public.recalculate_therapist_points(target_therapist_id INT, target_date DATE)
RETURNS VOID AS $$
DECLARE
  total_points NUMERIC := 0.0;
  pt_sum NUMERIC;
BEGIN
  -- 1) 이 마사지사가 주 마사지사(therapist_id)로 참여한 예약 포인트 계산
  --    - 단일 서비스(dry/wet)인 경우: price * plan.weight (기본 1.0)
  --    - 콤보(combo) 요금제인 경우: plan.massage_price * plan.massage_weight
  SELECT COALESCE(SUM(
    CASE 
      WHEN p.category = 'combo' THEN COALESCE(p.massage_price, 0) * COALESCE(p.massage_weight, 1.0)
      ELSE r.price * COALESCE(p.weight, 1.0)
    END
  ), 0) INTO pt_sum
  FROM public.reservations r
  LEFT JOIN public.pricing_plans p ON r.pricing_plan_id = p.id
  WHERE r.therapist_id = target_therapist_id 
    AND DATE(r.start_time AT TIME ZONE 'Asia/Seoul') = target_date
    AND r.status = 'confirmed';
    
  total_points := total_points + pt_sum;

  -- 2) 이 마사지사가 보조 마사지사(secondary_therapist_id)로 참여한 예약 포인트 계산
  --    - 오직 콤보(combo) 요금제일 때만 점수 발생: plan.bath_price * plan.bath_weight
  SELECT COALESCE(SUM(
    CASE 
      WHEN p.category = 'combo' THEN COALESCE(p.bath_price, 0) * COALESCE(p.bath_weight, 1.0)
      ELSE 0
    END
  ), 0) INTO pt_sum
  FROM public.reservations r
  LEFT JOIN public.pricing_plans p ON r.pricing_plan_id = p.id
  WHERE r.secondary_therapist_id = target_therapist_id 
    AND DATE(r.start_time AT TIME ZONE 'Asia/Seoul') = target_date
    AND r.status = 'confirmed';

  total_points := total_points + pt_sum;

  -- 3) therapist_daily_points 테이블에 반영
  INSERT INTO public.therapist_daily_points (therapist_id, date, points, updated_at)
  VALUES (target_therapist_id, target_date, total_points, NOW())
  ON CONFLICT (therapist_id, date) 
  DO UPDATE SET 
    points = EXCLUDED.points,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
