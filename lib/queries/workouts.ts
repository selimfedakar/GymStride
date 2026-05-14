import { supabase } from '../supabase'
import type { WorkoutLog, WorkoutLogInsert } from '@/types/database'

export interface EarnedBadgeResult {
  badgeId:   string
  badgeName: string
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
