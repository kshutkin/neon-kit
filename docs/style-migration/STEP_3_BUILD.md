# Native style build — step 3

Completed on 2026-10-09. The [migration plan](../STYLE_SYSTEM_MIGRATION_PLAN.md)
now has a working compiler/Vite contract for assets, maps, authoring types,
optimized package imports, and development edits. This extends the
[step 2 proof](STEP_2_PROOF.md); the real theme and components migrate in steps 4–5.

## Compiler contract

`compileStyle(entryId, host, { sourceMap, projectRoot })` remains independent of
Vite and the filesystem. In addition to CSS, composed class strings, dependencies,
and the existing URL list, it returns:

- `urls`: original URLs, compiler placeholders, and authored source locations.
- `map`: optional JSON source map with the original source text.
- Exported types for the module, host, dependency, URL, and compiler options.

`rewriteStyleUrls(module, replacements)` rewrites values through the CSS AST and
composes source mappings. `createStyleDeclaration(specifier, module)` emits named
string exports and native `sheets: CSSStyleSheet[]` authoring types. The compiler
continues to decide classes and sheet order; the Vite adapter never recompiles
CSS Modules using a second naming policy.

Authored `@import` order is preserved instead of being alphabetized. Unrelated
composition sources retain a stable ID order. The restricted import contract
and once-per-root sheet adoption remain; conflicting composed declarations need
an explicit authoring order policy.

Map composition needed two concrete fixes: matching the logical source filename
when `projectRoot` makes it relative, and retaining original `sourcesContent`
rather than Lightning CSS's escaped copy. Tests check original source text,
mapping positions, and valid source indexes after URL rewriting. Lightning CSS
maps CSS rules; declaration-level precision is not promised.

## Vite integration

The plugin emits native CSS and raw JS facades, retaining typed CSS imports.
Each CSS source remains a separate sheet asset. Relative `url()` files are resolved
through Vite and emitted with a content hash; references are relative to the CSS
asset. Query/fragment suffixes and encoded filename characters survive rewriting.
Public-directory root URLs use Vite's normal public copying and deployment base.
External, data, protocol-relative, blob, and fragment-only URLs remain unchanged.

For example, the documentation/consumer build contains:

```text
assets/
  shadow-base.<hash>.css          # native reset + asset URL proof
  surface.module.<hash>.css       # shared visual defaults
  control.module.<hash>.css
  card.module.<hash>.css
  <each-native-sheet>.css.map
  mark.<content-hash>.svg
  <hash>.styles.js                # raw native imports + class strings + sheets
  <ordinary-app-and-lazy-chunks>.js
  <ordinary-JSX-CSS>.css
slice-public.svg                  # copied through Vite publicDir
```

The proof has four distinct native sheets, four native CSS maps, and one emitted
native image. Instances and lazy components share the same base/surface sheet
objects. Native class strings match between development and production.

Source maps follow `css.devSourcemap` and `build.sourcemap`, including hidden,
inline, and disabled modes. CSS source text is checked against the actual packed
or documentation source files. Application JS marker replacement uses MagicString
maps so Vite retains the authored JS mappings. The generated facades contain
compiled data and have no authored JavaScript to map.

The optimizer's Rolldown hook externalizes native imports to raw endpoints.
The consumer explicitly prebundles its component package; no exclusion is needed
for packages containing `?neon`. Endpoint identities carry the original source
and import spelling, so cached optimizer output works after a server restart.
Requests respect Vite filesystem permissions. The plugin uses Vite's environment
resolver and client `hotUpdate` hook.

Compilation is cached per entry. Dependency tracking includes style and image
files. Affected graphs are invalidated, generated authoring types are refreshed,
and normal JSX CSS is invalidated before a full-page reload. This preserves class
and sheet consistency while keeping browser runtime code small. Finer sheet-only
HMR is an optional future optimization.

## Authoring types

```js
styleBuild({ declarations: 'native-styles.d.ts' })
```

The option is disabled by default. Include the generated file in the TypeScript
project. Builds collect the full reachable graph, including lazy entries;
development collects requested modules. Run a build to generate all types before
checking a project containing lazy imports.

Package-qualified CSS imports get exact ambient module declarations. Relative
names become suffix patterns because TypeScript disallows relative ambient module
names. Different sources sharing one pattern are rejected; use package-qualified
imports in that case. The export name `sheets` remains reserved. TypeScript 5.6+
supports arbitrary string export names. Packed-consumer checks accept real class
exports and reject a misspelled class through `@ts-expect-error`.

## Validation

- **Compiler:** 7 focused tests, generated-type checks, and JavaScript source checks.
- **Vite adapter:** 6 build tests covering nested chunk/asset directories, relative
  deployment base, public/external/data/fragment URLs, encoded filenames, JS/CSS
  maps, all source-map modes, declaration ambiguity, and the reserved export.
- **Packed consumer:** compiler/plugin temporary copies run their real flattening
  prepack operation before packing. Renderer JavaScript is transpiled while source
  CSS imports remain. All packages install into an isolated app without workspace
  source aliases.
- **Chromium 147.0.7727.15 and Firefox 148.0.2:** development and production pass
  asset requests, composition, sheet sharing, lazy loading, scheme inheritance,
  overrides, keyboard focus, and separate vanilla HTML checks.
- **Optimizer:** prebundled component presence is asserted in Vite metadata;
  restarting against cached optimizer output passes in Chromium.
- **Development edits:** shared control CSS refreshes both renderers; a new class
  refreshes authoring exports; an image edit changes the emitted asset URL and
  refreshes shadow styles. These edit checks run in Chromium.
- **Documentation:** isolated output passes both browsers and both OS preferences;
  regular `build:docs` passes with its existing CSS optimization/icon warnings.

[Recorded output/browser summary](step-3/summary.json) and
[documentation screenshot](step-3/docs-firefox-dark.png) are retained evidence.
The screenshot is the final fixture state: forced dark page, one forced light
host, inherited border override, and lazy/nested cards. It is not a theme baseline.

## Reproduce and remaining boundaries

```sh
pnpm --filter @neon-kit/style-build test
pnpm --filter @neon-kit/vite-plugin-style-build test
pnpm test:style-slice
pnpm dev:style-slice
pnpm build:style-slice-docs
```

Use the repository dependencies and installed Playwright Chromium/Firefox.
The browser proof still packs a local Slimlib candidate exposing `shadowStyles()`;
installed `@slimlib/element@0.4.1` lacks it. Override its directory with
`NEON_SLIMLIB_ELEMENT` if necessary. Publishing that runtime API remains a release
prerequisite; no sibling runtime files are modified.

SSR, cross-document sheet adoption, runtime asset-URL expressions, and standalone
CDN output are outside this native-sheet contract. The plugin owns native asset
filenames under `build.assetsDir`; it does not implement custom runtime URL hooks.
The full vanilla emitter, real theme translation, form/accessibility behavior,
and component shadow migration remain the later plan steps.

## References

- [Vite plugin and environment hooks](https://vite.dev/guide/api-plugin.html)
- [Lightning CSS transforms](https://lightningcss.dev/transforms.html)
- [TypeScript arbitrary module identifiers](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-6.html#support-for-arbitrary-module-identifiers)
