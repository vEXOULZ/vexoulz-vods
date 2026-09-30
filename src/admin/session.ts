// The admin session: one client and one reactive session for the whole app. The router guard calls `ensure()`;
// any 401 from the API drops the session so the next navigation lands on the login page.
import { reactive, readonly } from 'vue'
import { AdminApiError, AdminClient, type AdminUser, type Session } from './api'

export const adminBase: string = import.meta.env.VITE_ADMIN_API || '/backend-admin'
export const admin = new AdminClient({ base: adminBase })

const state = reactive({
  checked: false,
  authenticated: false,
  passwordLogin: true,
  twitchLogin: false,
  user: null as AdminUser | null,
  expiresAt: null as string | null,
  /** Why the admin was sent to the login page (expired session). */
  notice: null as string | null,
})
export const session = readonly(state)

function apply(s: Session) {
  state.checked = true
  state.authenticated = s.authenticated
  state.passwordLogin = s.passwordLogin
  state.twitchLogin = s.twitchLogin ?? false
  state.user = s.user ?? null
  state.expiresAt = s.expiresAt
  admin.csrf = s.csrf
}

/** Where "Sign in with Twitch" starts: the worker sends the browser through vexoulz-auth and back to `next`. */
export function twitchLoginUrl(next: string): string {
  return `${adminBase}/admin/signin?${new URLSearchParams({ next })}`
}

/** Why a Twitch sign-in came back to the login page (`?auth_error=` from the worker's callback). */
export const SIGNIN_ERRORS: Record<string, string> = {
  denied: 'The sign-in was cancelled on Twitch.',
  expired: 'The sign-in expired or was already used (or finished in another browser). Try again.',
  twitch: "Twitch didn't answer. Try again in a moment.",
  not_allowed: "That Twitch account isn't one of the archive's admins (ARCHIVE_ADMIN_TWITCH_IDS).",
  unavailable: "The sign-in service couldn't be reached. Try again in a moment.",
  misconfigured:
    "The sign-in service turned down the archive itself: its client ID or secret (ARCHIVE_ADMIN_AUTH_CLIENT_*) doesn't match vexoulz-auth's. The password still works from the local network.",
}

let onExpired: (() => void) | null = null
/** Called (by main.ts) with a way to go to the login page when the session expires mid-use. */
export function setExpiredHandler(fn: () => void) {
  onExpired = fn
}

admin.onUnauthorized = () => {
  if (!state.authenticated) return
  state.authenticated = false
  admin.csrf = null
  state.notice = 'Your session ended. Log in again.'
  onExpired?.()
}

let pending: Promise<void> | null = null
/** Loads the session once (the guard awaits it on every admin navigation). */
export function ensure(): Promise<void> {
  if (state.checked) return Promise.resolve()
  pending ??= admin
    .session()
    .then(apply)
    .catch((e: unknown) => {
      // Unreachable admin API: treat as logged out; the login page shows the error when it tries.
      state.checked = true
      state.authenticated = false
      if (!(e instanceof AdminApiError)) console.warn('admin session check failed', e)
    })
    .finally(() => (pending = null))
  return pending
}

export async function login(password: string): Promise<void> {
  apply(await admin.login(password))
  state.notice = null
}

export async function logout(): Promise<void> {
  try {
    await admin.logout()
  } finally {
    state.authenticated = false
    state.user = null
    state.expiresAt = null
    admin.csrf = null
  }
}
