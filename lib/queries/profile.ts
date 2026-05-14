import { supabase } from '../supabase'
import type { Profile, ProfileInsert, ProfileUpdate, GymPreferences, RunningPreferences, University, ProfilePhoto, ExperienceLevel } from '@/types/database'

export interface PublicProfile {
  id:                string
  username:          string
  full_name:         string
  date_of_birth:     string
  bio:               string | null
  profile_photo_url: string | null
  location_name:     string | null
  experience_level:  ExperienceLevel
  last_active_at:    string
}

export async function fetchPublicProfile(profileId: string): Promise<{
  profile:      PublicProfile
  photos:       ProfilePhoto[]
  badges:       { name: string; category: 'gym' | 'running' | 'general'; icon_name: string | null }[]
  gymPrefs:     GymPreferences | null
  runningPrefs: RunningPreferences | null
} | null> {
  const [profileRes, photosRes, badgesRes, gymRes, runRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,username,full_name,date_of_birth,bio,profile_photo_url,location_name,experience_level,last_active_at')
      .eq('id', profileId)
      .maybeSingle(),
    supabase.from('profile_photos').select('*').eq('profile_id', profileId).order('position'),
    supabase.from('profile_badges').select('badge:badges(name,category,icon_name)').eq('profile_id', profileId),
    supabase.from('gym_preferences').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('running_preferences').select('*').eq('profile_id', profileId).maybeSingle(),
  ])
  if (!profileRes.data) return null
  return {
    profile:      profileRes.data as PublicProfile,
    photos:       photosRes.data ?? [],
    badges:       ((badgesRes.data ?? []) as any[]).map((r) => r.badge).filter(Boolean),
    gymPrefs:     gymRes.data ?? null,
    runningPrefs: runRes.data ?? null,
  }
}

export async function reportUser(reportedId: string, reason: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    reported_id: reportedId,
    reason,
  })
  if (error && error.code !== '23505') throw error
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createProfile(profile: ProfileInsert): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert(profile)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProfile(userId: string, updates: ProfileUpdate): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function upsertGymPreferences(prefs: Partial<GymPreferences> & { profile_id: string }): Promise<void> {
  const { error } = await supabase
    .from('gym_preferences')
    .upsert(prefs, { onConflict: 'profile_id' })
  if (error) throw error
}

export async function upsertRunningPreferences(prefs: Partial<RunningPreferences> & { profile_id: string }): Promise<void> {
  const { error } = await supabase
    .from('running_preferences')
    .upsert(prefs, { onConflict: 'profile_id' })
  if (error) throw error
}

export async function searchUniversities(query: string): Promise<University[]> {
  const { data, error } = await supabase
    .from('universities')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(10)
  if (error) throw error
  return data
}

export async function uploadProfilePhoto(userId: string, uri: string): Promise<string> {
  const rawExt     = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ext        = rawExt === 'jpg' ? 'jpeg' : rawExt
  const path       = `${userId}/avatar.${ext}`
  const response   = await fetch(uri)
  const arrayBuffer = await response.arrayBuffer()

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { upsert: true, contentType: `image/${ext}` })
  if (error) throw error

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}

export async function fetchProfilePhotos(profileId: string): Promise<ProfilePhoto[]> {
  const { data, error } = await supabase
    .from('profile_photos')
    .select('*')
    .eq('profile_id', profileId)
    .order('position')
  if (error) throw error
  return data ?? []
}

export async function upsertProfilePhoto(profileId: string, uri: string, position: number): Promise<ProfilePhoto> {
  const rawExt      = uri.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ext         = rawExt === 'jpg' ? 'jpeg' : rawExt
  const path        = `${profileId}/photo_${position}.${ext}`
  const response    = await fetch(uri)
  const arrayBuffer = await response.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { upsert: true, contentType: `image/${ext}` })
  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = `${urlData.publicUrl}?v=${Date.now()}`

  const { data, error } = await supabase
    .from('profile_photos')
    .upsert({ profile_id: profileId, url, position }, { onConflict: 'profile_id,position' })
    .select()
    .single()
  if (error) throw error

  // Keep the canonical avatar column in sync with the primary photo slot
  if (position === 0) {
    await supabase.from('profiles').update({ profile_photo_url: url }).eq('id', profileId)
  }

  return data
}

export async function deleteProfilePhoto(profileId: string, position: number): Promise<void> {
  const { error } = await supabase
    .from('profile_photos')
    .delete()
    .eq('profile_id', profileId)
    .eq('position', position)
  if (error) throw error
}
