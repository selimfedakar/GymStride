export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// ────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────
export type GenderType        = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say'
export type ExperienceLevel   = 'beginner' | 'intermediate' | 'advanced' | 'elite'
export type BadgeCategory     = 'gym' | 'running' | 'general'
export type RunType           = 'long_run' | 'short_run' | 'sprint'
export type ChatRequestStatus = 'pending' | 'accepted' | 'declined'

// ────────────────────────────────────────────────────────────
// Row types (what comes back from SELECT *)
// ────────────────────────────────────────────────────────────
export interface University {
  id:         string
  name:       string
  city:       string | null
  country:    string
  logo_url:   string | null
  created_at: string
}

export interface Profile {
  id:                string
  username:          string
  full_name:         string
  date_of_birth:     string    // ISO date string
  gender:            GenderType
  bio:               string | null
  profile_photo_url: string | null
  location:          string | null  // PostGIS geography, returned as WKT/GeoJSON
  location_name:     string | null
  university_id:     string | null
  experience_level:  ExperienceLevel
  is_active:            boolean
  is_admin:             boolean
  onboarding_completed: boolean
  last_active_at:       string
  created_at:        string
  updated_at:        string
}

export interface ProfileWithAge extends Profile {
  age: number
}

export interface Badge {
  id:            string
  name:          string
  description:   string | null
  category:      BadgeCategory
  icon_name:     string | null
  is_earnable:   boolean
  earn_criteria: Json | null
  created_at:    string
}

export interface ProfileBadge {
  id:         string
  profile_id: string
  badge_id:   string
  is_earned:  boolean
  earned_at:  string
}

export interface GymPreferences {
  profile_id:         string
  frequency_per_week: number | null
  gym_location:       string | null
  gym_name:           string | null
  workout_styles:     string[] | null
  updated_at:         string
}

export interface RunningPreferences {
  profile_id:              string
  run_types:               RunType[] | null
  avg_pace_seconds_per_km: number | null
  weekly_distance_km:      number | null
  preferred_time:          'morning' | 'afternoon' | 'evening' | null
  updated_at:              string
}

export interface ProfilePhoto {
  id:         string
  profile_id: string
  url:        string
  position:   number  // 0-2
  created_at: string
}

export interface WorkoutLog {
  id:           string
  profile_id:   string
  workout_type: string
  distance_km:  number | null
  logged_at:    string
  notes:        string | null
}

export interface ChatRequest {
  id:              string
  requester_id:    string
  target_id:       string
  opening_message: string
  status:          ChatRequestStatus
  created_at:      string
  responded_at:    string | null
}

export interface Conversation {
  id:              string
  created_at:      string
  last_message_at: string
}

export interface ConversationParticipant {
  conversation_id: string
  profile_id:      string
  joined_at:       string
}

export interface Message {
  id:              string
  conversation_id: string
  sender_id:       string
  content:         string
  created_at:      string
  read_at:         string | null
}

// ────────────────────────────────────────────────────────────
// Discovery function return types
// ────────────────────────────────────────────────────────────
export interface GymBuddyResult {
  profile_id:          string
  username:            string
  full_name:           string
  age:                 number
  experience_level:    ExperienceLevel
  badge_overlap_count: number
  distance_km:         number
  profile_photo_url:   string | null
  last_active_at:      string | null
}

export interface RunningBuddyResult {
  profile_id:              string
  username:                string
  full_name:               string
  age:                     number
  run_types:               string[]
  avg_pace_seconds_per_km: number | null
  badge_overlap_count:     number
  distance_km:             number
  profile_photo_url:       string | null
  last_active_at:          string | null
}

// ────────────────────────────────────────────────────────────
// Insert / Update types (strip server-generated fields)
// ────────────────────────────────────────────────────────────
export type ProfileInsert = Pick<
  Profile,
  'id' | 'username' | 'full_name' | 'date_of_birth' | 'gender'
> & Partial<Omit<Profile, 'id' | 'username' | 'full_name' | 'date_of_birth' | 'gender' | 'created_at' | 'updated_at'>>

export type ProfileUpdate = Partial<
  Omit<Profile, 'id' | 'created_at' | 'updated_at'>
>

export type ProfilePhotoInsert = Pick<ProfilePhoto, 'profile_id' | 'url' | 'position'>
export type ChatRequestInsert = Pick<ChatRequest, 'requester_id' | 'target_id' | 'opening_message'>
export type MessageInsert     = Pick<Message, 'conversation_id' | 'sender_id' | 'content'>
export type WorkoutLogInsert  = Pick<WorkoutLog, 'profile_id' | 'workout_type'> & Partial<Pick<WorkoutLog, 'distance_km' | 'notes'>>

// ────────────────────────────────────────────────────────────
// UI-layer helpers
// ────────────────────────────────────────────────────────────

/** Formats stored seconds/km as "mm:ss /km" */
export function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60)
  const secs = secondsPerKm % 60
  return `${mins}:${secs.toString().padStart(2, '0')} /km`
}

/** Dynamic age from ISO date string — mirrors the SQL AGE() logic */
export function calcAge(dateOfBirth: string): number {
  const dob  = new Date(dateOfBirth)
  const today = new Date()
  const age  = today.getFullYear() - dob.getFullYear()
  const m    = today.getMonth() - dob.getMonth()
  return m < 0 || (m === 0 && today.getDate() < dob.getDate()) ? age - 1 : age
}
