# Copilot instructions — neon-kit

## Repository overview

This is a pnpm workspace publishing the `@neon-kit/*` packages.

- [theme/](theme/) — `@neon-kit/theme`. Tailwind-based CSS theme + component
  styles. Ships raw CSS only.
- [web-components/](web-components/) — `@neon-kit/web-components`. Native
  custom elements that consume `@neon-kit/theme` markup. Unbundled JS with
  JSDoc types, types built by `dts-buddy`, prepack flattening via
  `pkgprn --flatten types,src --strip-comments`.
- [site/](site/) — source for the docs site (Vite + Tailwind). Owned by
  the root `package.json` (no separate workspace package). Run
  `pnpm dev` to start the dev server and `pnpm build:docs` to emit the
  static site to top-level `dist-docs/`. Top-nav splits the site into a
  `CSS` section (theme components) and a `Web Components` section
  (`wc-*` slugs).

## Architecture decisions

Always read the ADRs in [docs/adr/](docs/adr/) before changing
cross-cutting behavior.

- [docs/adr/0001-rendering-mode.md](docs/adr/0001-rendering-mode.md) —
  Web components are **Light DOM only** today. Do not introduce shadow
  roots in `web-components/src/`. A future Shadow-DOM / CDN mode is
  planned and will live behind a parallel entry point.

## Conventions

- ESM only (`"type": "module"`).
- Source is JavaScript with JSDoc types — no TypeScript source files in
  shipped packages. Type declarations are emitted by `dts-buddy`.
- Tests are `*.spec.mjs` under `tests/`, run via root
  [vitest.config.js](vitest.config.js) in **Vitest browser mode**
  (Playwright + Chromium). A real DOM is available, so customized
  built-ins (`<button is="...">`) and the popover API behave like in
  production. Run `pnpm exec playwright install chromium` once on a
  fresh checkout.
- Indentation: 4 spaces in source, matching the surrounding files.
- Patterns for build/test/types layout follow the sibling
  `kshutkin/rollup-extras` repo.

## Quick commands

```sh
pnpm install
pnpm -r build         # dts-buddy in each package
pnpm -r test          # vitest
pnpm --filter @neon-kit/web-components test
pnpm dev              # docs site dev server (root, sources in site/)
pnpm build:docs       # emit static docs to dist-docs/
```

## Gotchas

- **Never run `pnpm pack` (or `npm pack`) locally on packages that use
  `pkgprn --flatten` in `prepack`.** `pkgprn` rewrites the source tree
  in place: it moves files out of `src/`, strips JSDoc comments, and
  deletes anything not in `files`/`exports` (tests, tsconfig, types).
  Publish-time flattening is meant to run in a fresh CI checkout. To
  inspect the publish layout locally, copy the package to a scratch dir
  first, or extend `pkgprn` with a non-destructive `--dry-run` mode.
