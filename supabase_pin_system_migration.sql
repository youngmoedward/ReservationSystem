-- =========================================================
-- PIN 번호 시스템 & 5개 전용 권한 계정 마이그레이션 스크립트
-- =========================================================

-- 1. 마사지사(therapists) 테이블 PIN 번호 컬럼 추가 및 기존 데이터 순차 PIN 코드 업데이트 (2001, 2002...)
ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS pin_code TEXT DEFAULT '2001';

WITH ranked_therapists AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rnk
  FROM public.therapists
)
UPDATE public.therapists t
SET pin_code = (2000 + r.rnk)::text
FROM ranked_therapists r
WHERE t.id = r.id;


-- 2. 직원(employee) 테이블 PIN 번호 컬럼 추가 및 기존 데이터 순차 PIN 코드 업데이트 (1001, 1002...)
ALTER TABLE public.employee
  ADD COLUMN IF NOT EXISTS pin_code TEXT DEFAULT '1001';

WITH ranked_employees AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rnk
  FROM public.employee
)
UPDATE public.employee e
SET pin_code = (1000 + r.rnk)::text
FROM ranked_employees r
WHERE e.id = r.id;


-- 3. 5개 전용 권한 로그인 계정 테이블 (system_roles) - Pin code 제외 (ID / PW만 관리)
CREATE TABLE IF NOT EXISTS public.system_roles (
  id BIGSERIAL PRIMARY KEY,
  role_key TEXT UNIQUE NOT NULL, -- 'msg1', 'msg2', 'staff', 'leader', 'manager'
  role_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 만약 기존에 pin_code 컬럼이 생성되어 있었다면 제거
ALTER TABLE public.system_roles DROP COLUMN IF EXISTS pin_code;

-- 초기 5개 권한 계정 데이터 삽입 및 업데이트
INSERT INTO public.system_roles (role_key, role_name, username, password)
VALUES 
  ('msg1', '건식 마사지사', 'msg1', 'msg123'),
  ('msg2', '습식 마사지사', 'msg2', 'msg234'),
  ('staff', 'Staff', 'staff', 'staff123'),
  ('leader', 'Staff Leader', 'leader', 'leader123'),
  ('manager', 'Manager', 'manager', '12345!')
ON CONFLICT (role_key) 
DO UPDATE SET 
  username = EXCLUDED.username,
  password = EXCLUDED.password;

-- RLS 정책 설정
ALTER TABLE public.system_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on system_roles"
  ON public.system_roles FOR SELECT USING (true);

CREATE POLICY "Allow all on system_roles"
  ON public.system_roles FOR ALL USING (true) WITH CHECK (true);
