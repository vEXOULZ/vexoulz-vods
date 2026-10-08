@.conventions/CLAUDE.md

# vexoulz-vods

vods.vexoul.net: the VOD archive (list, watch page across YouTube parts, chat replay, `/manage`), on the
shared `@vexoulz/ui` design and the `@vexoulz/vods-core` engine. Published by `publish.yml` to the
`deploy` branch.

- The site is vods-core's app (`createVodsApp()` in `src/main.ts`): pages, Manage and their logic live in vods-core,
  not here. This repo keeps only the channel config, the site's name and art, and `main.ts`.
- The archive API (twitch-archive) is read-only from here: ask for new endpoints there.
- Dev servers in `.claude/launch.json`: `vods-dev` (:5175) proxies `/backend` to the public archive API;
  `vods-mock` runs the same port against vods-core's admin mock (`--mode mock`); the `-alt` variants use
  :5185 / :5186 so two can run side by side.
- Controls use the fixed heights (32px / 26px small); the header stays 48px, or is hidden in theater
  mode.
