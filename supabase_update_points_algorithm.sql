-- ========================================================================
-- [수정 스크립트] 마사지사 일별 포인트 정산 알고리즘 수정 패치
-- 
-- 정산 공식 변경 사항:
--   - 이전: 요금제 금액(price) * 요금제 가중치(weight)
--   - 이후: 요금제 가중치(weight) 자체를 점수(포인트)로 카운트
-- ========================================================================

CREATE OR REPLACE FUNCTION public.recalculate_therapist_points(target_therapist_id INT, target_date DATE)
RETURNS VOID AS $$
DECLARE
  total_points NUMERIC := 0.0;
  pt_sum NUMERIC;
BEGIN
  -- 1) 이 마사지사가 주 마사지사(therapist_id)로 참여한 예약 포인트 계산
  --    - 단일 서비스(dry/wet)인 경우: plan.weight (기본 1.0)
  --    - 콤보(combo) 요금제인 경우: plan.massage_weight
  SELECT COALESCE(SUM(
    CASE 
      WHEN p.category = 'combo' THEN COALESCE(p.massage_weight, 1.0)
      ELSE COALESCE(p.weight, 1.0)
    END
  ), 0) INTO pt_sum
  FROM public.reservations r
  LEFT JOIN public.pricing_plans p ON r.pricing_plan_id = p.id
  WHERE r.therapist_id = target_therapist_id 
    AND DATE(r.start_time AT TIME ZONE 'Asia/Seoul') = target_date
    AND r.status = 'confirmed';
    
  total_points := total_points + pt_sum;

  -- 2) 이 마사지사가 보조 마사지사(secondary_therapist_id)로 참여한 예약 포인트 계산
  --    - 오직 콤보(combo) 요금제일 때만 점수 발생: plan.bath_weight
  SELECT COALESCE(SUM(
    CASE 
      WHEN p.category = 'combo' THEN COALESCE(p.bath_weight, 1.0)
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

-- 오늘자 포인트를 새로운 공식 기준으로 재정산 트리거 작동
SELECT public.recalculate_therapist_points(t.id, CURRENT_DATE)
FROM public.therapists t
WHERE t.is_active = true;
