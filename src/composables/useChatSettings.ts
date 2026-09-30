// The viewer's chat settings, remembered in this browser. Storage can be missing or throw (private mode, blocked
// site data); the page then just starts from the defaults.
import { reactive, watch } from 'vue'
import { clamp } from '@vexoulz/ui'
import type { ChatSource, ChatSources } from '@vexoulz/vods-core'

export interface ChatSettings {
  /** Seconds; positive shows chat later. */
  delay: number
  timestamps: boolean
  badges: boolean
  /** Name colours: each chatter's own, or adjusted to stay readable on black. */
  colors: 'readable' | 'raw'
  emotes: { '7tv': boolean; bttv: boolean; ffz: boolean }
  size: 's' | 'm' | 'l'
  /** Share of the page width the chat takes beside the video, in percent (wide layouts; on phones chat sits below). */
  width: number
  open: boolean
  /** Which chat to replay: Twitch's VOD recording, doomtp-bot's live recording, or the archive's pick. */
  source: ChatSource | 'auto'
  /** How chatters are named: display name, username, or both (`Name (username)`). */
  names: 'display' | 'login' | 'both'
}

const KEY = 'vods.chat.v2'
/** v1 saved timestamps on by default; v2 starts them off, so v1's timestamps value isn't carried over. */
const OLD_KEY = 'vods.chat.v1'
export const DELAY_LIMIT = 600
export const WIDTH_MIN = 15
export const WIDTH_MAX = 50

export const defaultChatSettings = (): ChatSettings => ({
  delay: 0,
  timestamps: false,
  badges: true,
  colors: 'readable',
  emotes: { '7tv': true, bttv: true, ffz: true },
  size: 'm',
  width: 26,
  open: true,
  source: 'auto',
  names: 'display',
})

/**
 * The chat to ask for: the viewer's choice, unless this VOD has none of it and has the other one (then the other).
 * `sources` is unknown (null) until the first page is in; the choice is asked for as is until then.
 */
export function chatSourceFor(pref: ChatSettings['source'], sources: ChatSources | null): ChatSource | 'auto' {
  if (pref === 'auto' || !sources) return pref
  const other: ChatSource = pref === 'bot' ? 'replay' : 'bot'
  return sources[pref] === 0 && sources[other] > 0 ? other : pref
}

/** The name to show for a chatter; the username is left out when unknown or only differs from the name in case. */
export function chatName(user: string, login: string | null, mode: ChatSettings['names']): { name: string; login: string | null } {
  if (mode === 'login') return { name: login ?? user, login: null }
  if (mode === 'both' && login && login !== user.toLowerCase()) return { name: user, login }
  return { name: user, login: null }
}

function load(): ChatSettings {
  const base = defaultChatSettings()
  try {
    let raw = localStorage.getItem(KEY)
    let fromOld = false
    if (!raw) {
      raw = localStorage.getItem(OLD_KEY)
      fromOld = true
    }
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<ChatSettings>
    if (fromOld) delete saved.timestamps
    return {
      delay: typeof saved.delay === 'number' && Number.isFinite(saved.delay) ? clamp(saved.delay, -DELAY_LIMIT, DELAY_LIMIT) : base.delay,
      timestamps: typeof saved.timestamps === 'boolean' ? saved.timestamps : base.timestamps,
      badges: typeof saved.badges === 'boolean' ? saved.badges : base.badges,
      colors: saved.colors === 'raw' ? 'raw' : 'readable',
      emotes: { ...base.emotes, ...(saved.emotes && typeof saved.emotes === 'object' ? saved.emotes : {}) },
      size: saved.size === 's' || saved.size === 'l' ? saved.size : 'm',
      width:
        typeof saved.width === 'number' && Number.isFinite(saved.width)
          ? clamp(Math.round(saved.width), WIDTH_MIN, WIDTH_MAX)
          : base.width,
      open: typeof saved.open === 'boolean' ? saved.open : base.open,
      source: saved.source === 'replay' || saved.source === 'bot' ? saved.source : base.source,
      names: saved.names === 'login' || saved.names === 'both' ? saved.names : base.names,
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
