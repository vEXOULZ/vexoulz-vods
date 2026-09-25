# Admin API contract (what `/admin` on this site expects)

The admin pages talk to twitch-archive's **worker admin API** (the existing `/admin/*` routes), reached from the
browser at `<adminBase>` — by default `/backend-admin` on the site's own origin, the same way the public archive API
is at `/backend`. So `GET /admin/jobs` on the worker is `GET /backend-admin/admin/jobs` from the site. How that path
is routed to the worker is hosting, not part of this repo.

Conventions (as the worker does today): JSON bodies; errors are `{"error": true, "msg": "..."}` with a 4xx/5xx
status; action responses are `{"error": false, "msg": "...", "jobId"?: n}`; job objects are the worker's `_job_json`
shape. Times are ISO 8601 UTC.

Status of each part: **exists** (works today behind the API key), **new** (needs building).

## 1. Password sessions — new

The existing `Authorization: Bearer <admin api key>` keeps working for scripts. In addition:

| Request | Response |
|---|---|
| `GET /admin/session` (no auth) | `200 {"authenticated": bool, "csrf": string \| null, "expiresAt": string \| null, "passwordLogin": bool}` |
| `POST /admin/session` `{"password": "..."}` | `200` same shape + `Set-Cookie`; `401` wrong password; `429` with `Retry-After` when rate-limited; `404` when no password is configured (`passwordLogin: false`) |
| `DELETE /admin/session` (needs CSRF) | `204`, cookie cleared |

- Password from a new setting (e.g. `ARCHIVE_ADMIN_PASSWORD`), hashed with scrypt at startup and compared in constant
  time (same approach as doomtp-bot's `webui/auth.py`). No password configured → password login is off.
- Cookie `archive_admin`: random token, `HttpOnly; Secure; SameSite=Strict; Path=/`, 8 h lifetime. Sessions may live in
  memory (a restart logs admins out).
- Every `/admin/*` route accepts **either** the Bearer key **or** a valid session cookie. With the cookie, any
  non-GET request must send `X-CSRF-Token: <csrf>`; mismatch → `403`.
- Rate-limit failed logins (e.g. 5 per 5 minutes per client address). If the client address comes from a forwarded
  header, only trust it from a configured proxy address (setting, no default addresses in the repo).
- `GET /admin/refreshtoken` stays as it is (Google's redirect target, proven by its signed `state`).

## 2. Health — new

`GET /admin/health` →

```json
{
  "worker": { "ok": true, "runningJobs": 1, "startedAt": "..." },
  "api": { "ok": true },
  "youtube": { "authorized": true, "valid": true, "error": null, "checkedAt": "..." },
  "live": { "live": false, "streamId": null, "startedAt": null },
  "jobs": { "counts": { "queued": 0, "running": 1, "paused": 0, "done": 120, "failed": 2, "cancelled": 3 },
            "recentFailures": [ /* up to 5 job objects, newest first */ ] }
}
```

`youtube` may be cached (the real check refreshes a Google token; e.g. re-check at most every 10 minutes, and
`POST /admin/youtube/status` or `GET /admin/youtube/status` forces one — that route **exists**).

## 3. Jobs — mostly exists

- `GET /admin/kinds` — exists.
- `GET /admin/jobs?state=&vodId=&kind=&limit=` — exists. **New:** `before=<job id>` for paging older jobs.
- `GET /admin/jobs/{id}` — exists.
- `POST /admin/jobs` `{kind, vodId?, payload?, fromStep?, pauseBefore?, paused?}` — exists.
- `POST /admin/jobs/{id}/pause | resume {once?} | retry | cancel` — exist.
- **New:** `PATCH /admin/jobs/{id}` `{"pauseBefore": [steps] | null, "pauseNext": bool}` → job object.
- **New:** job events. The worker's per-job log lines (`ctx.log`) and step changes, stored per job (capped, e.g. the
  last 1000):
  `GET /admin/jobs/{id}/events?after=<seq>&limit=` →
  `{"data": [{"seq": 1, "at": "...", "level": "info|warning|error", "step": "upload", "message": "...",
  "progress": {"done": 3, "total": 10, "unit": "parts|bytes|percent"} | null}], "next": <seq>}`.
  Progress where a step knows it (capture, split, upload). Polling is enough for the MVP; an SSE stream is a later
  nicety.

## 4. VODs — new (the existing `/admin/delete`, `/admin/chapters`, `/admin/emotes`, ... stay)

- `GET /admin/vods/{id}` → the full VOD row as the public API serializes it, plus
  `{"chaptersLocked": bool, "jobs": [recent job objects for this VOD]}`.
- `PATCH /admin/vods/{id}` `{"title"?: string}` → the updated VOD.
- `PUT /admin/vods/{id}/chapters` `{"chapters": [{"name", "gameId", "imageTemplate"?, "start", "length",
  "restricted"}], "locked": bool}` → the updated VOD. Validate: sorted by start, no overlaps, inside the VOD's
  duration, lengths > 0. Store `image` too (template with a small size filled in) so old readers keep working.
  `locked: true` makes the automatic `chapters` step skip this VOD unless its payload has `"force": true`.
- `PUT /admin/vods/{id}/youtube` `{"youtube": [{"id", "type": "vod|live", "part", "duration"?}]}` and
  `PUT /admin/vods/{id}/drive` `{"drive": [{"id", "type"}]}` → the updated VOD.
- `GET /admin/twitch/games?query=` → `[{"gameId", "name", "imageTemplate"}]` (Helix category search), for the
  chapter editor.
- `GET /admin/vods/{id}/emotes` → the saved emote row (or `null`).
- After any VOD edit, the public API must serve the change right away (invalidate its cached responses for that VOD,
  and lists that include it).

## 5. Audit log — new

Every state-changing admin request is recorded: `{at, actor: "password" | "api-key", action, target, detail}`.
`GET /admin/audit?before=&limit=` → `{"data": [...]}`.
