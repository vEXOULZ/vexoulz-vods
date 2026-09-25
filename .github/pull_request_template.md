## What changed

## Checklist
- [ ] The branch is named per [Conventional Branch](../CONTRIBUTING.md#branches) (`feature/`, `bugfix/`, `hotfix/`, `release/`, `chore/`).
- [ ] **Mobile has the same functions as desktop.** Checked at ~390px: controls reflow or scroll, nothing is hidden.
- [ ] Controls use the fixed heights (32px / 26px small); the header stays 48px (or is hidden in theater mode).
- [ ] Images, logos and icons are placeholders until real assets exist.
- [ ] Time logic (parts, cuts, chat clock) lives in vods-core, not here.
- [ ] **No private infrastructure**: no hostnames of machines, IPs, server paths, proxy/tunnel config or deploy scripts. Those belong in the private homelab docs, not here.
