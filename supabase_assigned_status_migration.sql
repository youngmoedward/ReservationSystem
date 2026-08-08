-- Migration: Update reservations_cancellation_check constraint to allow 'assigned' status
-- The 'assigned' status represents locked/finalized bookings that cannot be edited.

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_cancellation_check;
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE public.reservations ADD CONSTRAINT reservations_cancellation_check CHECK (
  (status = 'confirmed' AND cancellation_type IS NULL AND penalty_points = 0)
  OR
  (status = 'assigned' AND cancellation_type IS NULL AND penalty_points = 0)
  OR
  (status = 'cancelled' AND cancellation_type = 'request' AND penalty_points = 1)
  OR
  (status = 'cancelled' AND cancellation_type = 'noshow' AND penalty_points = 3)
  OR
  (status = 'cancelled' AND cancellation_type = 'normal' AND penalty_points = 0)
);
