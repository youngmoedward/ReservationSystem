-- =========================================================
-- 마사지사 요일별 우선순위 관리 테이블 (therapist_priorities)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.therapist_priorities (
  id BIGSERIAL PRIMARY KEY,
  therapist_id BIGINT NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL, -- 'wet' (1F Bath Service) 또는 'dry' (2F Massage Service)
  day_of_week INT NOT NULL, -- 0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri, 5: Sat, 6: Sun
  priority_val TEXT DEFAULT 'x', -- '1', '2', '3', ..., 'x' (휴무)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_therapist_service_day UNIQUE(therapist_id, service_type, day_of_week)
);

-- RLS 정책 설정 (모든 사용자 읽기 허용, 인증 사용자 CUD 허용)
ALTER TABLE public.therapist_priorities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on therapist_priorities"
  ON public.therapist_priorities FOR SELECT
  USING (true);

CREATE POLICY "Allow all on therapist_priorities"
  ON public.therapist_priorities FOR ALL
  USING (true)
  WITH CHECK (true);
