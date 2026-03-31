# Website Agent Rules

## Purpose

`apps/website` is the public static ChillClaw marketing site. It is separate from the product clients and must stay GitHub Pages compatible.

## Figma Update Rule

- When the user asks to refresh the website from Figma, use the exact app copy method.
- Start from the latest Figma Make export structure for the website and keep the exported section/component layout as intact as possible.
- Only make the minimum repo-specific adaptations needed to run in this codebase:
  - replace `figma:asset/...` imports with repo-local files under `src/assets`
  - replace placeholder or design-time links with real ChillClaw repo/release/docs links
  - keep Vite/GitHub Pages compatibility, tests, and existing workspace conventions working
- Do not redesign, restyle, or refactor the exported website on your own unless the user explicitly asks for it.

## Architecture

- Keep the website fully static. Do not call the daemon, OpenClaw, or any runtime API from this app.
- Keep website-only components and styles local to `apps/website`.
- Prefer repo-owned assets over remote asset URLs.

## Safety

- Leave unrelated repo changes alone.
- If you add new website-local rules here, keep `CLAUDE.md` as a symlink to this file.
