import { supabase } from '../supabase'
import type { WorkoutLog, WorkoutLogInsert } from '@/types/database'

export interface EarnedBadgeResult {
  badgeId:   string
  badgeName: string
}

export interface StreakDay {
  date:  string
  count: number
}

export interface StreakSummary {
  currentStreak: number
  longestStreak: number
  activeToday:   boolean
  thisWeek:      number
  last7Days:     StreakDay[]
}

export interface ProgressWeek {
  week_start: string
  sessions:   number
  run_km:     number
}

export interface ProgressSummary {
  weeks:             ProgressWeek[]
  thisMonthKm:       number
  thisMonthSessions: number
}

// Last 8 weeks of training volume + current-month totals for the charts.
export async function fetchMyProgress(): Promise<ProgressSummary> {
  const { data, error } = await supabase.rpc('get_my_progress')
  if (error) throw error
  const d = (data ?? {}) as any
  return {
    weeks:             (d.weeks ?? []) as ProgressWeek[],
    thisMonthKm:       d.this_month_km ?? 0,
    thisMonthSessions: d.this_month_sessions ?? 0,
  }
}

// Reads the caller's own activity streak via SECURITY DEFINER RPC.
export async function fetchMyStreak(): Promise<StreakSummary> {
  const { data, error } = await supabase.rpc('get_my_streak')
  if (error) throw error
  const d = (data ?? {}) as any
  return {
    currentStreak: d.current_streak ?? 0,
    longestStreak: d.longest_streak ?? 0,
    activeToday:   d.active_today   ?? false,
    thisWeek:      d.this_week      ?? 0,
    last7Days:     (d.last_7_days ?? []) as StreakDay[],
  }
}

export async function insertWorkoutLog(log: WorkoutLogInsert): Promise<WorkoutLog> {
  const { data, error } = await supabase
    .from('workout_logs')
    .insert(log)
    .select()
    .single()
  if (error) throw error
  return data
}

export interface ImportedRun {
  workout_type: 'long_run' | 'short_run' | 'sprint'
  distance_km:  number | null
  logged_at:    string        // ISO
  external_id:  string        // HKWorkout UUID — dedupe key
  notes?:       string | null
}

// Bulk-inserts runs imported from Apple Health. Upserts on the
// (profile_id, external_id) unique index so re-imports don't duplicate.
// Returns the number of newly inserted rows.
export async function insertImportedRuns(profileId: string, runs: ImportedRun[]): Promise<number> {
  if (runs.length === 0) return 0
  const rows = runs.map((r) => ({
    profile_id:   profileId,
    workout_type: r.workout_type,
    distance_km:  r.distance_km,
    logged_at:    r.logged_at,
    notes:        r.notes ?? null,
    source:       'healthkit',
    external_id:  r.external_id,
  }))
  const { data, error } = await supabase
    .from('workout_logs')
    .upsert(rows, { onConflict: 'profile_id,external_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}

export async function fetchRecentLogs(profileId: string, limit = 20): Promise<WorkoutLog[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('profile_id', profileId)
    .order('logged_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

// Evaluation and badge insertion run inside the evaluate_and_award_badges()
// SECURITY DEFINER function — direct INSERT with is_earned = true is
// blocked by RLS on profile_badges, preventing client-side spoofing.
export async function evaluateAndAwardBadges(): Promise<EarnedBadgeResult[]> {
  const { data, error } = await supabase.rpc('evaluate_and_award_badges')
  if (error) throw error
  return ((data as { id: string; name: string }[]) ?? []).map((b) => ({
    badgeId:   b.id,
    badgeName: b.name,
  }))
}
