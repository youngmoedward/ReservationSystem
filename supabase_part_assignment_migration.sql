-- Migration: Add part-level assignment tracking columns to reservations table
-- These columns enable independent assignment of wet (secondary) and dry (primary) parts for combo plans.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS is_primary_assigned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_secondary_assigned BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN reservations.is_primary_assigned IS 'Whether the primary (dry/single) therapist part is assigned (locked). For non-combo plans, this alone determines assignment.';
COMMENT ON COLUMN reservations.is_secondary_assigned IS 'Whether the secondary (wet/bath) therapist part is assigned (locked). Only used for combo plans.';
