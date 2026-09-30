/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** vexoulz-auth's URL (the shared sign-in); empty turns it off. See .env.example. */
  readonly VITE_AUTH_BASE?: string
  /** The archive API's base URL (default `/backend` on the same origin). */
  readonly VITE_ARCHIVE_API?: string
  /** The worker admin API's base URL, for the Manage pages (default `/backend-admin` on the same origin). */
  readonly VITE_ADMIN_API?: string
  /** Dev only (vite.config.ts): where `/backend` is forwarded. */
  readonly VITE_DEV_API_TARGET?: string
  /** Dev only (vite.config.ts): where `/backend-admin` is forwarded; unset uses the mock (dev/adminMock.ts). */
  readonly VITE_DEV_ADMIN_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** The commit this build comes from (vite.config.ts). */
declare const __COMMIT__: string
