// The worker's vex-platform routes (/api/v2: job runs, their events and kinds, the audit log) through the shared
// client. Same session as the v1 admin client: the cookie, its CSRF token on writes, and its expiry handling.
import { PlatformClient } from '@vexoulz/platform-web'
import { admin, adminBase } from './session'

export const platform = new PlatformClient({
  base: `${adminBase}/api/v2`,
  csrf: () => admin.csrf,
  onUnauthorized: () => admin.onUnauthorized?.(),
  credentials: 'same-origin',
})

/** `vod:123` ↔ the VOD id, for the jobs' `subject`. */
export const vodSubject = (vodId: string) => `vod:${vodId}`
