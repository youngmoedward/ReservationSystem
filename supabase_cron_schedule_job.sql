-- =========================================================================================
-- [Supabase pg_cron] 매주 월요일 LA 시간 기준 새벽 4시 4주 뒤 일주일(월~일) 근무일 자동 생성
-- =========================================================================================

-- 1. pg_cron 확장 모듈 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- 2. 4주 뒤 일주일치(월~일 7일간) 근무일 자동 생성 PL/pgSQL 함수
CREATE OR REPLACE FUNCTION public.generate_future_week_therapist_schedule()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_la_now TIMESTAMP;
  v_curr_mon DATE;
  v_target_mon DATE;
  v_target_sun DATE;
  v_curr_date DATE;
  v_day_of_week INT;
BEGIN
  -- LA (Pacific Time) 기준 현재 시각 계산
  v_la_now := NOW() AT TIME ZONE 'America/Los_Angeles';
  
  -- 이번 주 월요일 날짜 구하기
  v_curr_mon := date_trunc('week', v_la_now)::DATE;
  
  -- 4주 뒤 월요일 및 일요일 날짜 구하기 (28일 뒤 ~ 34일 뒤)
  v_target_mon := v_curr_mon + INTERVAL '28 days';
  v_target_sun := v_target_mon + INTERVAL '6 days';

  -- 4주 뒤 월요일부터 일요일까지 7일간 루프
  v_curr_date := v_target_mon;
  WHILE v_curr_date <= v_target_sun LOOP
    -- ISO 요일 계산: 월요일=0, 화요일=1, ..., 일요일=6
    v_day_of_week := (EXTRACT(ISODOW FROM v_curr_date)::INT - 1);

    -- 모든 활성 마사지사에 대해 우선순위(therapist_priorities) 기준 데이터 생성
    -- [중요] ON CONFLICT DO NOTHING으로 기존 개별 수정 일정 100% 보존
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

-- 3. 기존 동일 작업 이름의 pg_cron이 있다면 언스케줄링
SELECT cron.unschedule('generate-4th-week-schedule-la-mon4am')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'generate-4th-week-schedule-la-mon4am'
);

-- 4. 매주 월요일 UTC 11:00 (LA 시간 기준 월요일 새벽 4시 / Daylight Saving) 에 pg_cron 작업 스케줄링
SELECT cron.schedule(
  'generate-4th-week-schedule-la-mon4am',
  '0 11 * * 1',
  $$SELECT public.generate_future_week_therapist_schedule();$$
);
