-- Migration: Add delay_minutes column to reservations table
-- Purpose: Support configurable delay time between wet and dry massage in combo plans
-- Default: 30 minutes (existing hardcoded value)

ALTER TABLE reservations
ADD COLUMN delay_minutes INTEGER DEFAULT 30;

-- Add comment for documentation
COMMENT ON COLUMN reservations.delay_minutes IS 'Delay time (in minutes) between wet massage and dry massage for combo plans. Default is 30 minutes.';
