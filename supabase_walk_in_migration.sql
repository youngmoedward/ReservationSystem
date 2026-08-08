-- Migration: Add is_walk_in column to reservations table
-- This column explicitly tracks whether a reservation was created via Walk-In flow.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN reservations.is_walk_in IS 'Whether this reservation was created via Walk-In flow (true) or regular booking (false).';

-- Retroactive update: 기존 Walk-In 데이터를 is_walk_in = true로 업데이트
-- 판별 기준: customer_name이 'Walk-in'으로 시작하는 경우
UPDATE reservations
SET is_walk_in = TRUE
WHERE LOWER(customer_name) LIKE 'walk-in%';
