# vods.vexoulz.net

The VOD archive: past broadcasts with their YouTube uploads, a timeline across all parts, and the Twitch chat
replayed alongside. Vue 3 + TypeScript on the shared [`@vexoulz/ui`](https://github.com/vEXOULZ/vexoulz-ui) design
and the headless [`@vexoulz/vods-core`](https://github.com/vEXOULZ/vods-core) engine. Replaces Archive-React-Vex.

```bash
npm install
npm run dev         # http://localhost:5175 (proxies /backend to the archive API)
npm run typecheck   # vue-tsc
npm test            # vitest
npm run build       # → dist/
git config core.hooksPath .githooks   # once per clone: branch-name rules, see CONTRIBUTING.md
```

`main` is merge-only and branches follow [Conventional Branch](https://conventional-branch.github.io/)
(`feature/…`, `bugfix/…`, `hotfix/…`, `release/…`, `chore/…`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Pages

| path | what |
|---|---|
| `/`, `/vods` | list: an "All" reset, title search, a game dropdown (every game in the archive, most played first), a tag dropdown (new / updated, and the tab's own tags such as complete; clicking a tag on a thumbnail sets it), date range, "load more"; all kept in the URL (`?tab=&tag=&title=&game=&from=&to=&page=`) |
| `/vods/:id` | watch the VOD uploads |
| `/live/:id` | watch the live uploads |
| `/youtube/:id` | watch whichever upload set exists (live first, like the old site) |
| `/games/:id?part=N` | the VOD's per-game uploads; `part` is the 1-based game |
| anything else | 404 |

Watch URLs take `?t=` in **VOD time** (`1h2m3s`, `1:02:03` or seconds) and `?part=N` to start a part from its
beginning. With neither, playback resumes where this browser left off. Links from the old site differ only on
VODs with restricted (cut) chapters, where the old `?t=` was upload time.

The watch page has the same controls on phones and desktops: part picker (with parts YouTube can't play marked,
plus a panel to skip them), chapters, copy link, Drive download when there is one, theater mode, keyboard
fullscreen, keyboard shortcuts (`?`), and chat settings (delay in 0.1 s steps, timestamps (off by default), badges,
name colours, emote sources, text size, chat width beside the video). Chat settings are saved in this browser;
watch progress follows the account when signed in (see "Signing in").

Thumbnails come from YouTube and box art from Twitch. Emotes load from each provider's own CDN (Twitch, 7TV, BTTV,
FFZ). The game dropdown comes from the archive's `/v1/games-played` and filters by exact game.

## Manage (`/manage`)
The archive's admin pages: status overview, the job queue (filter, start, pause/resume/retry/cancel, pause-before steps, live
log), VODs (search including hidden and merged ones; per VOD: public or hidden, details (title, thumbnail, duration, date),
chapters with Twitch category search and a lock, games rows, YouTube and Drive lists, saved emotes, re-fetch /
re-upload / delete actions, merge and split; adding VODs the monitor missed), Storage (disk use and the worker's
folders, deleting stale ones), Settings (the worker's runtime settings over its env defaults) and the audit log. It talks to twitch-archive's worker admin API at `/backend-admin` on the site's origin (`VITE_ADMIN_API`), with
a session (HttpOnly cookie + CSRF token) from "Sign in with Twitch" (through vexoulz-auth, for the worker's
`ARCHIVE_ADMIN_TWITCH_IDS`) or the admin password, which only works from the local network; the browser never holds an
API key. The contract is in
[docs/admin-api.md](docs/admin-api.md). The old `/admin/...` URLs redirect to `/manage/...`.

There is one sign-in. An admin signs in from the header's account menu, and a Twitch-purple **Manage** button appears
in the header (and a "Manage" item in the menu); the Manage bar shows only on the `/manage` pages. Someone signed in
to the account is checked once per browser, quietly: one trip through the worker's `/admin/signin?quiet=1`, which
comes straight back with `admin=1` or `admin=0` (`src/admin/quiet.ts`). The answer is kept in `localStorage` as
`vods-admin:<twitch id>`, so a plain viewer isn't checked again; for an admin, a dashboard session that ends while
the account is still signed in is renewed the same way. Signing out ends both and forgets the answer. Opening a
Manage page signed out goes through the worker's Twitch sign-in, which signs in to the account on the way;
`/manage/login` explains a failed sign-in and keeps the admin password for the local network.

In `npm run dev`, `/backend-admin` is a built-in in-memory mock (`dev/adminMock.ts`, password `admin`, and
"Sign in with Twitch" signs a fake admin in at once, as does the quiet check unless `MOCK_ADMIN_QUIET=no`; VODs come
from the public archive API and edits stay in memory) unless
`VITE_DEV_ADMIN_TARGET` is set in `.env.local`. The mock is never part of a build. To use the mock while
`.env.local` names a worker, run `npm run dev -- --mode mock` with `VITE_DEV_ADMIN_TARGET=` (empty) in
`.env.mock.local`. The mock also answers the public `/backend/vods/:id` for VODs it merged or split, so the watch
page shows the result (gap chapters, old links sent to the merged VOD).
It also keeps the site tags edited on `/manage/tags` (and serves `/backend/v1/site/tags`); `MOCK_SITE_TAGS=no`
answers 404 there instead, as the archive does until it has those routes.

## Signing in

The header's account menu is the shared *.vexoulz.net sign-in (vexoulz-auth, through `@vexoulz/ui/account`;
`src/lib/account.ts`). Signed in, watch progress is kept with the account (vods-core's `AccountProgressStore`), and
what this browser saved before is merged into it; signed out, progress stays in the browser. `AUTH_BASE` in
`src/lib/account.ts` (or `VITE_AUTH_BASE`) is vexoulz-auth's URL, `https://auth.vexoulz.net`; empty turns
sign-in off.

## Assets still needed

- The Twitch mark on the header's Manage button (`src/components/ManageLink.vue`, a `VxPlaceholder` for now).
- A vector shape for each drawn thumbnail tag: new, updated and complete (`VxPlaceholder`s for now). Upload them on
  `/manage/tags` once the archive has the site tags routes (`docs/admin-api.md` §6); until then put the SVGs in
  `public/tags/` and set each one's `shape` in `site.tags` (`src/vods.config.ts`).

## Config

Channel settings live in [`src/vods.config.ts`](src/vods.config.ts). The API base comes from `VITE_ARCHIVE_API`
(default `/backend`, same origin). In dev, Vite proxies `/backend` to `VITE_DEV_API_TARGET`, which defaults to the
public archive. See `.env.example`.

## Publishing

`.github/workflows/publish.yml` runs the checks, builds, and pushes `dist/` to the `deploy` branch on every merge
to `main`. The site is a single-page app, so the server must answer unknown paths with `index.html` and send
`/backend/*` to the archive API. `@vexoulz/ui` and `@vexoulz/vods-core` are pinned to git tags in `package.json`,
and Renovate opens the bumps.

## Infrastructure

This repo is host-agnostic: it builds and publishes, nothing more. Details about where or how the site is hosted
(machines, addresses, proxy or tunnel config, server paths, deploy scripts) belong in the private `homelab-docs`
repo and must never be committed here. `.gitignore` blocks `.env*` (except `.env.example`), `*.local.*` and
`/deploy.local/` so local host files can't slip in.
