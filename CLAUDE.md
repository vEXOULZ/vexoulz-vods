@.conventions/CLAUDE.md

# vexoulz-vods

vods.vexoul.net: the VOD archive (list, watch page across YouTube parts, chat replay, `/manage`), on the
shared `@vexoulz/ui` design and the `@vexoulz/vods-core` engine. Published by `publish.yml` to the
`deploy` branch.

- Time logic (parts, cuts, the chat clock) lives in vods-core, not here.
- The archive API (twitch-archive) is read-only from here: ask for new endpoints there.
- Dev servers in `.claude/launch.json`: `vods-dev` (:5175) proxies `/backend` to the public archive API;
  `vods-mock` runs the same port against the mocks in `dev/` (`--mode mock`); the `-alt` variants use
  :5185 / :5186 so two can run side by side.
- Controls use the fixed heights (32px / 26px small); the header stays 48px, or is hidden in theater
  mode.
