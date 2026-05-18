import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'

interface AuthState {
  session:           Session | null
  profile:           Profile | null
  loading:           boolean
  sentRequestIds:    string[]
  setSession:        (session: Session | null) => void
  setProfile:        (profile: Profile | null) => void
  setLoading:        (loading: boolean) => void
  addSentRequestId:  (id: string) => void
  reset:             () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session:          null,
  profile:          null,
  loading:          true,
  sentRequestIds:   [],
  setSession:       (session) => set({ session }),
  setProfile:       (profile) => set({ profile }),
  setLoading:       (loading) => set({ loading }),
  addSentRequestId: (id) => set((s) => ({ sentRequestIds: [...s.sentRequestIds, id] })),
  reset:            () => set({ session: null, profile: null, loading: false, sentRequestIds: [] }),
}))
