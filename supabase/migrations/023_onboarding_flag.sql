-- Add onboarding_completed flag so reviewers can be forced through the full flow
-- Default false — new sign-ups complete onboarding before reaching the main app.
-- Existing users (already have location_name set) are backfilled to true.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

UPDATE profiles
  SET onboarding_completed = true
  WHERE location_name IS NOT NULL;
