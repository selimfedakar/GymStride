import { supabase } from '../supabase'

// Block hides both users from each other in discovery + messages and
// cancels pending requests between them (server-enforced in block_user).
export async function blockUser(blockedId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_blocked_id: blockedId })
  if (error) throw error
}

export async function unblockUser(blockedId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_blocked_id: blockedId })
  if (error) throw error
}

// Ids the caller has blocked — used to hide any rows the RPCs might miss.
export async function fetchBlockedIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_my_blocked_ids')
  if (error) throw error
  return ((data ?? []) as { get_my_blocked_ids: string }[] | string[]).map((r: any) =>
    typeof r === 'string' ? r : r.get_my_blocked_ids,
  )
}

export interface BlockedProfile {
  id:                string
  full_name:         string
  username:          string
  profile_photo_url: string | null
}

// Blocked users with display info, for the "Blocked Users" management screen.
export async function fetchBlockedProfiles(): Promise<BlockedProfile[]> {
  const ids = await fetchBlockedIds()
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, profile_photo_url')
    .in('id', ids)
  if (error) throw error
  return (data ?? []) as BlockedProfile[]
}
