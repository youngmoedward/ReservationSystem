-- =========================================================================
-- Riviera Health Spa 예약 시스템 - 근무일정 변경이력 수행자명 자동 탐색 트리거 개량 마이그레이션
-- =========================================================================

CREATE OR REPLACE FUNCTION public.log_therapist_schedule_changes()
RETURNS TRIGGER AS $$
DECLARE
  performer_uuid UUID;
  performer_name TEXT := '시스템';
  performer_pin TEXT := '';
  t_name TEXT;
  details_text TEXT;
  action_type TEXT;
BEGIN
  -- 1. 수행자(updated_by) 추출
  IF (TG_OP = 'DELETE') THEN
    performer_uuid := OLD.updated_by;
  ELSE
    performer_uuid := NEW.updated_by;
  END IF;

  -- 2. 수행자(직원/매니저)의 실명과 PIN 탐색
  IF performer_uuid IS NOT NULL THEN
    SELECT name, pin_code INTO performer_name, performer_pin 
    FROM public.employee 
    WHERE id = performer_uuid 
    LIMIT 1;

    IF performer_name IS NULL THEN
      -- 만약 employee에 없고 마사지사 자체 user_id일 경우
      SELECT name, pin_code INTO performer_name, performer_pin 
      FROM public.therapists 
      WHERE user_id = performer_uuid 
      LIMIT 1;
    END IF;
  END IF;

  -- 수행자명 기본값 처리
  IF performer_name IS NULL OR performer_name = '' THEN
    performer_name := '관리자';
  END IF;

  -- 3. 대상 마사지사 이름 탐색
  IF (TG_OP = 'DELETE') THEN
    SELECT name INTO t_name FROM public.therapists WHERE id = OLD.therapist_id;
  ELSE
    SELECT name INTO t_name FROM public.therapists WHERE id = NEW.therapist_id;
  END IF;

  IF t_name IS NULL THEN
    t_name := '마사지사';
  END IF;

  -- 4. 변경 액션 및 상세내용 빌드
  IF (TG_OP = 'INSERT') THEN
    action_type := 'create';
    details_text := t_name || '의 ' || NEW.date || ' 근무 일정을 [' || 
      COALESCE(NEW.availability_type, '미결정') || ']로 신규 설정함.';
  ELSIF (TG_OP = 'UPDATE') THEN
    action_type := 'update';
    IF OLD.availability_type IS DISTINCT FROM NEW.availability_type THEN
      details_text := t_name || '의 ' || NEW.date || ' 근무 일정을 [' || 
        COALESCE(OLD.availability_type, '미결정') || '] -> [' || COALESCE(NEW.availability_type, '미결정') || ']로 변경함.';
    ELSE
      details_text := t_name || '의 ' || NEW.date || ' 근무 일정 정보를 업데이트함.';
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    action_type := 'delete';
    details_text := t_name || '의 ' || OLD.date || ' 근무 일정을 삭제함.';
  END IF;

  -- 5. [수행자: 이름 (PIN)] 형태로 접두사 추가하여 HistoryManager에 호환되도록 구성
  IF performer_pin IS NOT NULL AND performer_pin != '' THEN
    details_text := '[수행자: ' || performer_name || ' (' || performer_pin || ')] ' || details_text;
  ELSE
    details_text := '[수행자: ' || performer_name || '] ' || details_text;
  END IF;

  -- 6. 이력 로그 적재
  INSERT INTO public.reservation_logs (
    log_type,
    action,
    performed_by,
    details
  ) VALUES (
    'schedule',
    action_type,
    performer_uuid,
    details_text
  );

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
