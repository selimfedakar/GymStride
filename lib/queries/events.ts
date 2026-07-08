import { supabase } from '../supabase'

export interface EventSummary {
  id:                string
  title:             string
  event_type:        string
  location_name:     string | null
  starts_at:         string
  max_participants:  number | null
  notes:             string | null
  creator_id:        string
  creator_name:      string
  participant_count: number
  joined:            boolean
  distance_km:       number | null
}

export interface EventMessage {
  id:         string
  event_id:   string
  sender_id:  string
  content:    string
  created_at: string
}

export interface EventParticipant {
  profile_id:        string
  full_name:         string
  username:          string
  profile_photo_url: string | null
}

export interface CreateEventInput {
  title:            string
  eventType:        'gym' | 'running' | 'other'
  startsAt:         string  // ISO
  locationName?:    string | null
  lat?:             number | null
  lng?:             number | null
  maxParticipants?: number | null
  notes?:           string | null
}

export async function fetchNearbyEvents(
  radiusKm = 50,
  type: 'gym' | 'running' | null = null,
): Promise<EventSummary[]> {
  const { data, error } = await supabase.rpc('get_nearby_events', {
    p_radius_km: radiusKm,
    p_type:      type,
  })
  if (error) throw error
  return (data ?? []) as EventSummary[]
}

export async function createEvent(input: CreateEventInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_event', {
    p_title:            input.title,
    p_event_type:       input.eventType,
    p_starts_at:        input.startsAt,
    p_location_name:    input.locationName ?? null,
    p_lat:              input.lat ?? null,
    p_lng:              input.lng ?? null,
    p_max_participants: input.maxParticipants ?? null,
    p_notes:            input.notes ?? null,
  })
  if (error) throw error
  return data as string
}

export interface EventDetail {
  id:               string
  title:            string
  event_type:       string
  location_name:    string | null
  starts_at:        string
  max_participants: number | null
  notes:            string | null
  creator_id:       string
  creator_name:     string
}

// Fetches a single event (any authenticated user can read events).
export async function fetchEventById(eventId: string): Promise<EventDetail | null> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, event_type, location_name, starts_at, max_participants, notes, creator_id, creator:profiles!creator_id(full_name)')
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const creator = Array.isArray((data as any).creator) ? (data as any).creator[0] : (data as any).creator
  return {
    id:               (data as any).id,
    title:            (data as any).title,
    event_type:       (data as any).event_type,
    location_name:    (data as any).location_name,
    starts_at:        (data as any).starts_at,
    max_participants: (data as any).max_participants,
    notes:            (data as any).notes,
    creator_id:       (data as any).creator_id,
    creator_name:     creator?.full_name ?? 'Someone',
  }
}

export async function joinEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('join_event', { p_event_id: eventId })
  if (error) throw error
}

export async function leaveEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_event', { p_event_id: eventId })
  if (error) throw error
}

export async function fetchEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await supabase
    .from('event_participants')
    .select('profile:profiles(id, full_name, username, profile_photo_url)')
    .eq('event_id', eventId)
  if (error) throw error
  return ((data ?? []) as any[])
    .map((r) => r.profile)
    .filter(Boolean)
    .map((p: any) => ({
      profile_id:        p.id,
      full_name:         p.full_name,
      username:          p.username,
      profile_photo_url: p.profile_photo_url,
    }))
}

export async function fetchEventMessages(eventId: string): Promise<EventMessage[]> {
  const { data, error } = await supabase
    .from('event_messages')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as EventMessage[]
}

export async function sendEventMessage(eventId: string, senderId: string, content: string): Promise<EventMessage> {
  const { data, error } = await supabase
    .from('event_messages')
    .insert({ event_id: eventId, sender_id: senderId, content })
    .select()
    .single()
  if (error) throw error
  return data as EventMessage
}

export function subscribeToEventMessages(eventId: string, onMessage: (m: EventMessage) => void) {
  return supabase
    .channel(`event-messages:${eventId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'event_messages', filter: `event_id=eq.${eventId}` },
      (payload) => onMessage(payload.new as EventMessage),
    )
    .subscribe()
}
