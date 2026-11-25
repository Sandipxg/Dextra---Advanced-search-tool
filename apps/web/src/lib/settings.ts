import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface SettingsState {
  /** Settings → Advanced search options (D-006). */
  advanced: boolean
  setAdvanced: (advanced: boolean) => void
}

/** UI-only preferences, kept per browser (storage failures are ignored by Zustand). */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      advanced: false,
      setAdvanced: (advanced) => set({ advanced }),
    }),
    { name: 'dextra-settings', storage: createJSONStorage(() => localStorage) },
  ),
)
