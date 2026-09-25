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
| `/`, `/vods` | list: title search, game chips, date range, "load more"; all kept in the URL (`?title=&game=&from=&to=&page=`) |
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
shortcuts (`?`), and chat settings (delay in 0.1 s steps, timestamps, badges, name colours, emote sources, text
size). Chat settings and watch progress are saved in this browser; accounts come later.

Thumbnails and box art are placeholders until real assets exist.

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
