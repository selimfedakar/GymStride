import { supabase } from '../supabase'
import type { GymBuddyResult, RunningBuddyResult, RunType } from '@/types/database'

export async function fetchGymBuddies(
  userId: string,
  radiusKm = 50,
  minFrequency = 1,
  limit = 20,
  offset = 0,
): Promise<GymBuddyResult[]> {
  const { data, error } = await supabase.rpc('discover_gym_buddies', {
    p_current_user_id: userId,
    p_radius_km:       radiusKm,
    p_min_frequency:   minFrequency,
    p_limit:           limit,
    p_offset:          offset,
  })
  if (error) {
    console.error('[discovery] discover_gym_buddies:', error.code, error.message, error.details, error.hint)
    throw new Error(error.message ?? `RPC error ${error.code}`)
  }
  return (data ?? []) as GymBuddyResult[]
}

export async function fetchRunningBuddies(
  userId: string,
  radiusKm = 50,
  runType: RunType | null = null,
  limit = 20,
  offset = 0,
): Promise<RunningBuddyResult[]> {
  const { data, error } = await supabase.rpc('discover_running_buddies', {
    p_current_user_id: userId,
    p_radius_km:       radiusKm,
    p_filter_run_type: runType,
    p_limit:           limit,
    p_offset:          offset,
  })
  if (error) {
    console.error('[discovery] discover_running_buddies:', error.code, error.message, error.details, error.hint)
    throw new Error(error.message ?? `RPC error ${error.code}`)
  }
  return (data ?? []) as RunningBuddyResult[]
}
