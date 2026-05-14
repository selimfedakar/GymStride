import { supabase } from '../supabase'
import type { Badge, ProfileBadge, WorkoutLogInsert } from '@/types/database'

export async function fetchAllBadges(): Promise<Badge[]> {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .order('category')
  if (error) throw error
  return data
}

export async function fetchProfileBadges(profileId: string): Promise<(ProfileBadge & { badge: Badge })[]> {
  const { data, error } = await supabase
    .from('profile_badges')
    .select('*, badge:badges(*)')
    .eq('profile_id', profileId)
  if (error) throw error
  return data as any
}

export async function toggleBadge(profileId: string, badgeId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('profile_badges')
    .select('id')
    .eq('profile_id', profileId)
    .eq('badge_id', badgeId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('profile_badges')
      .delete()
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('profile_badges')
      .insert({ profile_id: profileId, badge_id: badgeId, is_earned: false })
    if (error) throw error
  }
}

export async function logWorkout(log: WorkoutLogInsert): Promise<void> {
  const { error } = await supabase.from('workout_logs').insert(log)
  if (error) throw error
  // Badge evaluation is handled server-side via a Supabase Edge Function
  // triggered on workout_logs INSERT
}
