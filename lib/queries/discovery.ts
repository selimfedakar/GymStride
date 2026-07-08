import { supabase } from '../supabase'
import type { GymBuddyResult, RunningBuddyResult, RunType } from '@/types/database'

export interface BuddyPin {
  profile_id:        string
  full_name:         string
  profile_photo_url: string | null
  lat:               number
  lng:               number
  distance_km:       number
}

// Privacy-fuzzed map pins (≈1.1km cells) for the discovery map view.
export async function fetchBuddyPins(
  radiusKm = 50,
  type: 'gym' | 'running' | null = null,
): Promise<BuddyPin[]> {
  const { data, error } = await supabase.rpc('get_buddy_pins', {
    p_radius_km: radiusKm,
    p_type:      type,
  })
  if (error) {
    console.error('[discovery] get_buddy_pins:', error.code, error.message)
    throw new Error(error.message ?? `RPC error ${error.code}`)
  }
  return (data ?? []) as BuddyPin[]
}

export interface GymFilters {
  sameUniversity?: boolean
  experience?:     import('@/types/database').ExperienceLevel | null
}

export async function fetchGymBuddies(
  userId: string,
  radiusKm = 50,
  minFrequency = 1,
  limit = 20,
  offset = 0,
  filters: GymFilters = {},
): Promise<GymBuddyResult[]> {
  const { data, error } = await supabase.rpc('discover_gym_buddies', {
    p_current_user_id: userId,
    p_radius_km:       radiusKm,
    p_min_frequency:   minFrequency,
    p_limit:           limit,
    p_offset:          offset,
    p_same_university: filters.sameUniversity ?? false,
    p_experience:      filters.experience ?? null,
  })
  if (error) {
    console.error('[discovery] discover_gym_buddies:', error.code, error.message, error.details, error.hint)
    throw new Error(error.message ?? `RPC error ${error.code}`)
  }
  return (data ?? []) as GymBuddyResult[]
}

export interface RunningFilters {
  sameUniversity?: boolean
  maxPaceSeconds?: number | null
}

export async function fetchRunningBuddies(
  userId: string,
  radiusKm = 50,
  runType: RunType | null = null,
  limit = 20,
  offset = 0,
  filters: RunningFilters = {},
): Promise<RunningBuddyResult[]> {
  const { data, error } = await supabase.rpc('discover_running_buddies', {
    p_current_user_id: userId,
    p_radius_km:       radiusKm,
    p_filter_run_type: runType,
    p_limit:           limit,
    p_offset:          offset,
    p_same_university: filters.sameUniversity ?? false,
    p_max_pace:        filters.maxPaceSeconds ?? null,
  })
  if (error) {
    console.error('[discovery] discover_running_buddies:', error.code, error.message, error.details, error.hint)
    throw new Error(error.message ?? `RPC error ${error.code}`)
  }
  return (data ?? []) as RunningBuddyResult[]
}
