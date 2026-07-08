-- ============================================================
-- GymStride — 026: Seed the badges catalogue
-- Run in Supabase SQL Editor → New Query → Run.
--
-- The badges table was previously populated by hand from the dashboard,
-- which meant a fresh environment had no badges (onboarding badge picker
-- empty, no earnable badges to award). This seeds them reproducibly.
--
-- Idempotent: ON CONFLICT (name) DO NOTHING — safe to re-run and safe to
-- apply on top of the existing hand-seeded production rows.
--
-- earn_criteria shapes must match the CASE in evaluate_and_award_badges()
-- (migration 003): total_sessions | gym_frequency | running_streak |
-- monthly_distance_km | multi_run_type_week.
-- ============================================================

INSERT INTO public.badges (name, description, category, icon_name, is_earnable, earn_criteria) VALUES
  -- ── Earnable: Gym ──────────────────────────────────────────
  ('Gym Rookie',      'Logged your first gym session',              'gym',     NULL, true,
    '{"type":"total_sessions","workout_type":"gym","count":1}'),
  ('Gym Regular',     'Logged 10 gym sessions',                     'gym',     NULL, true,
    '{"type":"total_sessions","workout_type":"gym","count":10}'),
  ('Iron Committed',  '3+ gym days a week for 4 straight weeks',     'gym',     NULL, true,
    '{"type":"gym_frequency","sessions_per_week":3,"weeks":4}'),

  -- ── Earnable: Running ──────────────────────────────────────
  ('Sprinter',        'Logged 5 sprint sessions',                   'running', NULL, true,
    '{"type":"total_sessions","workout_type":"sprint","count":5}'),
  ('Long Hauler',     'Logged 5 long runs',                         'running', NULL, true,
    '{"type":"total_sessions","workout_type":"long_run","count":5}'),
  ('7-Day Streak',    'Ran 7 days in a row',                        'running', NULL, true,
    '{"type":"running_streak","days":7}'),
  ('Century Club',    'Ran 100 km in a single month',               'running', NULL, true,
    '{"type":"monthly_distance_km","amount":100}'),
  ('Versatile Runner','A 10 km+ long run and a sprint in one week', 'running', NULL, true,
    '{"type":"multi_run_type_week","min_long_run_km":10}'),

  -- ── Self-selected: Gym styles (discovery matching) ─────────
  ('Powerlifter',     'Focused on the big three',                   'gym',     NULL, false, NULL),
  ('Bodybuilder',     'Training for aesthetics',                    'gym',     NULL, false, NULL),
  ('CrossFitter',     'Constantly varied, high intensity',          'gym',     NULL, false, NULL),
  ('Calisthenics',    'Bodyweight mastery',                         'gym',     NULL, false, NULL),
  ('Olympic Lifter',  'Snatch and clean & jerk',                    'gym',     NULL, false, NULL),

  -- ── Self-selected: Running styles ──────────────────────────
  ('Marathoner',      'Training for the long distance',             'running', NULL, false, NULL),
  ('Trail Runner',    'Off-road and elevation',                     'running', NULL, false, NULL),
  ('Track Athlete',   'Speed work on the track',                    'running', NULL, false, NULL),

  -- ── Self-selected: General ─────────────────────────────────
  ('Early Bird',      'Trains in the morning',                      'general', NULL, false, NULL),
  ('Night Owl',       'Trains late',                                'general', NULL, false, NULL),
  ('Weekend Warrior', 'Big weekend sessions',                       'general', NULL, false, NULL)
ON CONFLICT (name) DO NOTHING;
