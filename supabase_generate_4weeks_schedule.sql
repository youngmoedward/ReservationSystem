-- =========================================================================================
-- 마사지사 요일별 우선순위(therapist_priorities) 마스터 데이터 기반 4주 일정 생성 (DATE 타입 캐스팅 적용)
-- [원칙]: 기 생성된 데이터는 절대로 덮어쓰지 않고(DO NOTHING), 신규 생성 날짜에만 적용됩니다.
-- =========================================================================================

-- 1. 4주간 근무 일정 자동 생성 Stored Procedure / Function
CREATE OR REPLACE FUNCTION public.generate_4weeks_therapist_schedule()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE := CURRENT_DATE;
  v_end_date DATE := CURRENT_DATE + INTERVAL '27 days';
  v_curr_date DATE;
  v_day_of_week INT;
BEGIN
  -- 날짜 루프: 오늘부터 28일간
  v_curr_date := v_start_date;
  WHILE v_curr_date <= v_end_date LOOP
    -- ISO 요일 계산: 월요일=0, 화요일=1, ..., 일요일=6
    v_day_of_week := (EXTRACT(ISODOW FROM v_curr_date)::INT - 1);

    -- 모든 활성 마사지사에 대해 우선순위(therapist_priorities) 기준으로 미등록 신규 일자에만 데이터 생성
    -- v_curr_date 는 DATE 타입이므로 그대로 지정
    INSERT INTO public.therapist_schedule (therapist_id, date, availability_type)
    SELECT 
      t.id AS therapist_id,
      v_curr_date AS date,
      CASE 
        WHEN LOWER(COALESCE(p.priority_val, 'x')) = 'x' THEN 'off'
        ELSE 'full'
      END AS availability_type
    FROM public.therapists t
    LEFT JOIN public.therapist_priorities p 
      ON t.id = p.therapist_id 
     AND p.day_of_week = v_day_of_week
    WHERE t.is_active = true
    ON CONFLICT (therapist_id, date) 
    DO NOTHING;

    v_curr_date := v_curr_date + INTERVAL '1 day';
  END LOOP;
END;
$$;

-- 2. 지금 바로 오늘부터 4주간(28일) 근무여부 데이터 즉시 재생성 실행
SELECT public.generate_4weeks_therapist_schedule();
