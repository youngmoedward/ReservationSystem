-- =========================================================================
-- Riviera Health Spa 예약 시스템 - PIN 번호 중복 마이그레이션 및 고유 제약조건 설정 (에러 수정본)
-- =========================================================================

-- 1. 기존에 중복되어 등록된 모든 PIN 번호(employee & therapists 통합)를 자동으로 찾아
--    중복되지 않는 새로운 임의의 4자리 PIN(1000 ~ 9999)으로 갱신하는 PL/pgSQL 블록 실행
DO $$
DECLARE
    row_record RECORD;
    new_pin TEXT;
BEGIN
    -- [A] 직원 테이블(employee) 내에서 중복된 pin_code 수정
    FOR row_record IN 
        WITH ranked AS (
            SELECT id, pin_code, ROW_NUMBER() OVER(PARTITION BY pin_code ORDER BY id) as rn
            FROM (
                SELECT id::text, pin_code FROM public.employee
                UNION ALL
                SELECT id::text, pin_code FROM public.therapists
            ) unified
        )
        SELECT k.id, k.pin_code FROM ranked k
        JOIN public.employee e ON e.id::text = k.id
        WHERE k.rn > 1
    LOOP
        LOOP
            -- 1000 ~ 9999 사이의 무작위 4자리 PIN 생성
            new_pin := floor(random() * 9000 + 1000)::text;
            -- 두 테이블 모두에서 사용 중이지 않은 PIN일 때 루프 탈출
            IF NOT EXISTS (SELECT 1 FROM public.employee WHERE pin_code = new_pin) AND
               NOT EXISTS (SELECT 1 FROM public.therapists WHERE pin_code = new_pin) THEN
                EXIT;
            END IF;
        END LOOP;
        
        UPDATE public.employee
        SET pin_code = new_pin
        WHERE id::text = row_record.id;
    END LOOP;

    -- [B] 마사지사 테이블(therapists) 내에서 중복된 pin_code 수정
    FOR row_record IN 
        WITH ranked AS (
            SELECT id, pin_code, ROW_NUMBER() OVER(PARTITION BY pin_code ORDER BY id) as rn
            FROM (
                SELECT id::text, pin_code FROM public.employee
                UNION ALL
                SELECT id::text, pin_code FROM public.therapists
            ) unified
        )
        SELECT k.id, k.pin_code FROM ranked k
        JOIN public.therapists t ON t.id::text = k.id
        WHERE k.rn > 1
    LOOP
        LOOP
            new_pin := floor(random() * 9000 + 1000)::text;
            IF NOT EXISTS (SELECT 1 FROM public.employee WHERE pin_code = new_pin) AND
               NOT EXISTS (SELECT 1 FROM public.therapists WHERE pin_code = new_pin) THEN
                EXIT;
            END IF;
        END LOOP;
        
        UPDATE public.therapists
        SET pin_code = new_pin
        WHERE id::text = row_record.id;
    END LOOP;
END $$;

-- 2. 중복이 해소되었으므로, 향후 DB에 물리적으로 중복 PIN이 저장되는 것을 방지하기 위해 
--    각 테이블에 UNIQUE 제약조건(Constraint)을 적용합니다.
ALTER TABLE public.employee DROP CONSTRAINT IF EXISTS employee_pin_code_unique;
ALTER TABLE public.employee ADD CONSTRAINT employee_pin_code_unique UNIQUE (pin_code);

ALTER TABLE public.therapists DROP CONSTRAINT IF EXISTS therapists_pin_code_unique;
ALTER TABLE public.therapists ADD CONSTRAINT therapists_pin_code_unique UNIQUE (pin_code);
