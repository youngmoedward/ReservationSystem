-- =========================================================================
-- 찜질방 마사지 예약 관리 시스템 - Supabase SQL 스키마 및 더미 데이터 스크립트
-- =========================================================================

-- 1. 기존 테이블 및 트리거 정리 (순서 보장)
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS employee;
DROP TABLE IF EXISTS therapists;

-- 2. therapists (마사지사) 테이블 생성
CREATE TABLE therapists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_premium_target BOOLEAN DEFAULT FALSE, -- 오늘 고급 마사지를 몰아받을 직원 여부
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. employee (권한 포함 프론트 직원) 테이블 생성
-- auth.users의 UUID를 외래키로 참조하여 보안성과 유효성을 보장합니다.
CREATE TABLE employee (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'staff')), -- 관리자, 일반 직원
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. reservations (예약 정보) 테이블 생성
CREATE TABLE reservations (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  price NUMERIC NOT NULL,
  
  -- [개선안] is_premium 자동 계산 컬럼: 특정 금액(예: 100,000원) 이상일 때 자동으로 true가 되도록 Generated Column 적용
  -- 만약 수동 설정이 무조건 필요하다면 "is_premium BOOLEAN DEFAULT FALSE" 로 교체 가능합니다.
  is_premium BOOLEAN GENERATED ALWAYS AS (price >= 100000) STORED, 
  
  therapist_id INT REFERENCES therapists(id) ON DELETE SET NULL, -- 배정된 마사지사
  created_by UUID REFERENCES employee(id) ON DELETE SET NULL,     -- 등록한 프론트 직원 (profiles가 아닌 employee 참조로 수정)
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. [더미 데이터 삽입 1] therapists (마사지 직원 10명)
INSERT INTO therapists (id, name, is_active, is_premium_target) VALUES
  (1, '김테라', true, false),
  (2, '이마사', true, true),      -- 고급 마사지 오늘 타겟 설정
  (3, '박안마', true, false),
  (4, '최힐러', true, false),
  (5, '정케어', true, false),
  (6, '강릴랙', true, true),      -- 고급 마사지 오늘 타겟 설정
  (7, '조타이', true, false),
  (8, '윤스웨', true, false),
  (9, '임스포츠', true, false),
  (10, '한지압', false, false)    -- 비활성 직원 (휴무/퇴사 등 테스트용)
ON CONFLICT (id) DO NOTHING;

-- SERIAL sequence 값 보정 (ID 수동 강제 매핑 후 다음 auto-increment 보정을 위해 실행)
SELECT setval(pg_get_serial_sequence('therapists', 'id'), COALESCE(MAX(id), 1)) FROM therapists;

-- 6. [더미 데이터 삽입 2] auth.users & employee (테스트용 계정 데이터)
-- SQL Editor에서 테스트를 하기 위해 auth.users 스키마에 더미 인증 데이터를 먼저 주입하고,
-- 그에 대응하는 employee 테이블 데이터를 입력합니다.

-- auth.users 에 더미 사용자 주입 (비밀번호: password123, 비밀번호 검증 헬퍼 pgcrypto 사용)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 
    '00000000-0000-0000-0000-000000000000', 
    'manager@example.com', 
    crypt('password123', gen_salt('bf')), 
    now(), 
    'authenticated', 
    'authenticated', 
    '{"provider":"email","providers":["email"]}', 
    '{"name":"관리자(홍길동)"}', 
    now(), 
    now()
  ),
  (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 
    '00000000-0000-0000-0000-000000000000', 
    'staff1@example.com', 
    crypt('password123', gen_salt('bf')), 
    now(), 
    'authenticated', 
    'authenticated', 
    '{"provider":"email","providers":["email"]}', 
    '{"name":"직원A(이순신)"}', 
    now(), 
    now()
  ),
  (
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 
    '00000000-0000-0000-0000-000000000000', 
    'staff2@example.com', 
    crypt('password123', gen_salt('bf')), 
    now(), 
    'authenticated', 
    'authenticated', 
    '{"provider":"email","providers":["email"]}', 
    '{"name":"직원B(강감찬)"}', 
    now(), 
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- employee 테이블에 테스트 계정 매핑 데이터 주입
INSERT INTO employee (id, name, role) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '관리자(홍길동)', 'manager'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '직원A(이순신)', 'staff'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', '직원B(강감찬)', 'staff')
ON CONFLICT (id) DO NOTHING;


-- 7. [더미 데이터 삽입 3] reservations (예약 샘플 데이터)
-- 마사지사 배정 및 프론트 직원 배정 관계를 매칭하여 더미 예약 내역 2개를 삽입합니다.
INSERT INTO reservations (customer_name, customer_phone, start_time, end_time, price, therapist_id, created_by, status) VALUES
  ('홍길동', '010-1234-5678', now() + interval '1 hour', now() + interval '2 hour', 120000, 2, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'confirmed'),
  ('성춘향', '010-9876-5432', now() + interval '3 hour', now() + interval '4 hour', 80000, 6, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'confirmed')
ON CONFLICT DO NOTHING;


-- 8. reservation_logs (예약 변경 이력) 테이블 생성
DROP TABLE IF EXISTS reservation_logs;
CREATE TABLE reservation_logs (
  id SERIAL PRIMARY KEY,
  reservation_id INT REFERENCES reservations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'cancel')),
  performed_by UUID REFERENCES employee(id) ON DELETE SET NULL,
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  details TEXT
);
