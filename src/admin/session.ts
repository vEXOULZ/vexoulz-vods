// The admin session: one client and one reactive session for the whole app. The router guard calls `ensure()`;
// any 401 from the API drops the session so the next navigation lands on the login page.
import { reactive, readonly } from 'vue'
import { AdminApiError, AdminClient, type Session } from './api'

export const adminBase: string = import.meta.env.VITE_ADMIN_API || '/backend-admin'
export const admin = new AdminClient({ base: adminBase })

const state = reactive({
  checked: false,
  authenticated: false,
  passwordLogin: true,
  expiresAt: null as string | null,
  /** Why the admin was sent to the login page (expired session). */
  notice: null as string | null,
})
export const session = readonly(state)

function apply(s: Session) {
  state.checked = true
  state.authenticated = s.authenticated
  state.passwordLogin = s.passwordLogin
  state.expiresAt = s.expiresAt
  admin.csrf = s.csrf
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
    state.expiresAt = null
    admin.csrf = null
  }
}
