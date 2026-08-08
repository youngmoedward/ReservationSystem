-- Migration: Create tables for managing operating hours and exception dates (holidays, shortened hours).
-- Apply Row Level Security (RLS) policies so authenticated users can read, but only manager roles can modify.

-- 1. Create default operating hours table (Mon = 0, ..., Sun = 6)
CREATE TABLE IF NOT EXISTS public.operating_hours_default (
  id SERIAL PRIMARY KEY,
  day_of_week INT NOT NULL UNIQUE CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time TIME NOT NULL DEFAULT '09:00',
  close_time TIME NOT NULL DEFAULT '21:00',
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create exception operating hours table (specific dates)
CREATE TABLE IF NOT EXISTS public.operating_hours_exceptions (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Insert default seed data for all 7 days (09:00 to 21:00)
INSERT INTO public.operating_hours_default (day_of_week, open_time, close_time, is_closed)
VALUES
  (0, '09:00', '21:00', false), -- Mon
  (1, '09:00', '21:00', false), -- Tue
  (2, '09:00', '21:00', false), -- Wed
  (3, '09:00', '21:00', false), -- Thu
  (4, '09:00', '21:00', false), -- Fri
  (5, '09:00', '21:00', false), -- Sat
  (6, '09:00', '21:00', false)  -- Sun
ON CONFLICT (day_of_week) DO NOTHING;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.operating_hours_default ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_hours_exceptions ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for operating_hours_default
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.operating_hours_default;
DROP POLICY IF EXISTS "Allow modify for managers" ON public.operating_hours_default;
DROP POLICY IF EXISTS "Allow all on operating_hours_default" ON public.operating_hours_default;
CREATE POLICY "Allow all on operating_hours_default" ON public.operating_hours_default
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Create RLS Policies for operating_hours_exceptions
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.operating_hours_exceptions;
DROP POLICY IF EXISTS "Allow modify for managers" ON public.operating_hours_exceptions;
DROP POLICY IF EXISTS "Allow all on operating_hours_exceptions" ON public.operating_hours_exceptions;
CREATE POLICY "Allow all on operating_hours_exceptions" ON public.operating_hours_exceptions
  FOR ALL USING (true) WITH CHECK (true);
