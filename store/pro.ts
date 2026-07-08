import { create } from 'zustand'
import { isProActive } from '@/lib/purchases'

interface ProState {
  isPro:     boolean
  checked:   boolean          // has the entitlement been fetched at least once
  setPro:    (v: boolean) => void
  refresh:   () => Promise<void>
}

// Global Pro entitlement state. Refreshed on launch and after a purchase.
export const useProStore = create<ProState>((set) => ({
  isPro:   false,
  checked: false,
  setPro:  (v) => set({ isPro: v, checked: true }),
  refresh: async () => {
    const active = await isProActive()
    set({ isPro: active, checked: true })
  },
}))
