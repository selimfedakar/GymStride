-- ============================================================
-- GymStride — 027: Workout provenance (for HealthKit import)
-- Run in Supabase SQL Editor → New Query → Run.
--
-- Adds a source + external_id so runs imported from Apple Health can be
-- de-duplicated on re-import (the HKWorkout UUID goes in external_id).
-- Manual logs keep source='manual' and external_id NULL.
-- ============================================================

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS source      TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id TEXT;

-- One row per (profile, external_id) so importing the same Apple Health
-- workout twice is a no-op. Partial index → manual logs (NULL external_id)
-- are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_logs_external
  ON public.workout_logs (profile_id, external_id)
  WHERE external_id IS NOT NULL;
