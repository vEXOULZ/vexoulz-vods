// The viewer's chat settings, remembered in this browser. Storage can be missing or throw (private mode, blocked
// site data); the page then just starts from the defaults.
import { reactive, watch } from 'vue'

export interface ChatSettings {
  /** Seconds; positive shows chat later. */
  delay: number
  timestamps: boolean
  badges: boolean
  /** Name colours: each chatter's own, or adjusted to stay readable on black. */
  colors: 'readable' | 'raw'
  emotes: { '7tv': boolean; bttv: boolean; ffz: boolean }
  size: 's' | 'm' | 'l'
  open: boolean
}

const KEY = 'vods.chat.v1'
export const DELAY_LIMIT = 600

export const defaultChatSettings = (): ChatSettings => ({
  delay: 0,
  timestamps: true,
  badges: true,
  colors: 'readable',
  emotes: { '7tv': true, bttv: true, ffz: true },
  size: 'm',
  open: true,
})

function load(): ChatSettings {
  const base = defaultChatSettings()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<ChatSettings>
    return {
      delay: typeof saved.delay === 'number' && Number.isFinite(saved.delay) ? Math.max(-DELAY_LIMIT, Math.min(DELAY_LIMIT, saved.delay)) : base.delay,
      timestamps: typeof saved.timestamps === 'boolean' ? saved.timestamps : base.timestamps,
      badges: typeof saved.badges === 'boolean' ? saved.badges : base.badges,
      colors: saved.colors === 'raw' ? 'raw' : 'readable',
      emotes: { ...base.emotes, ...(saved.emotes && typeof saved.emotes === 'object' ? saved.emotes : {}) },
      size: saved.size === 's' || saved.size === 'l' ? saved.size : 'm',
      open: typeof saved.open === 'boolean' ? saved.open : base.open,
    }
  } catch {
    return base
  }
}

let shared: ChatSettings | null = null

export function useChatSettings(): ChatSettings {
  if (shared) return shared
  const s = reactive(load())
  watch(
    s,
    () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(s))
      } catch {
        // not saved; still works for this visit
      }
    },
    { deep: true },
  )
  shared = s
  return s
}
