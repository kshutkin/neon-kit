# @neon-kit/vite-plugin-style-build

Vite adapter for the [style migration](../docs/STYLE_SYSTEM_MIGRATION_PLAN.md).
The separate `@neon-kit/style-build` compiler owns class exports and the sheet
graph. This package owns Vite resolution, native sheet endpoints, asset emission,
source-map delivery, dependency optimization, and development reloads.
Ordinary `.module.css` imports continue through Vite's normal CSS Modules pipeline.

## Configuration

```js
import { defineConfig } from 'vite';
import { styleBuild } from '@neon-kit/vite-plugin-style-build';

export default defineConfig({
    plugins: [styleBuild({ declarations: 'native-styles.d.ts' })],
    css: { devSourcemap: true },
    // Preserve native light-dark() in ordinary JSX CSS too.
    build: { cssTarget: ['chrome128', 'firefox128'], sourcemap: true },
});
```

`declarations` is optional and disabled by default. It writes only to the configured
file, relative to the project root. Include that file in the TypeScript project.
A production build collects the complete reachable graph, including lazy imports;
development collects modules as requested. Use a build to generate all authoring
types before checking a project containing lazy components. TypeScript 5.6 or later
supports arbitrary string export names.

The adapter targets Vite 8 and browsers supporting native CSS module scripts.
The proof runs in Chromium and Firefox. The CSS target above preserves native
`light-dark()`; Vite's default CSS lowering uses helper variables that do not follow
the proof's dynamically inherited scheme. The plugin does not set page or host
`color-scheme`.

## Imports and types

```js
import { button, sheets } from './button.module.css?neon';
import { sheets as base } from './shadow-base.css?neon';

// Adopt [...base, ...sheets] in the component's shadow root.
// Use button as its class string, including composed classes.
```

Every CSS Modules class export becomes a named string. `sheets` is the ordered
`CSSStyleSheet[]`; that class name is reserved. Plain shadow-only `.css?neon`
entries supply sheets without class exports. Package-qualified imports generate
exact ambient declarations. Relative names use suffix patterns; two different
sources sharing a pattern are rejected. Use package-qualified imports to avoid
that ambiguity.

## Assets and source maps

Native CSS stays in distinct shared assets. Generated JS facades contain native
`with { type: 'css' }` imports and are emitted as raw assets so Vite cannot strip
their attributes or inject shadow rules into document CSS. Development serves
corresponding raw endpoints under Vite's base path with CSS/JS MIME types.

Relative `url()` files are resolved from their source sheet, emitted with content
hashes, and referenced relative to the emitted CSS. Queries, fragments, and encoded
filename characters are preserved. Root URLs to `publicDir` files retain the
public path; normal Vite copying owns their production files. External, data, blob,
protocol-relative, and fragment-only URLs remain unchanged. Native assets honor
`build.assetsDir`; relative deployment bases and nested asset/chunk directories
are tested. Native filenames are owned by the adapter.

CSS maps follow `css.devSourcemap` in development and `build.sourcemap` in
production (`true`, `hidden`, `inline`, or disabled). They include authored source
text and Lightning CSS's rule-level mappings. Marker replacement in application
JS also returns a map so Vite can preserve its existing source mappings. Generated
facades contain compiled data and have no authored JavaScript to map.

## Optimizer and development

The plugin adds a Vite 8 Rolldown optimizer hook that leaves native imports as raw
endpoints. Packages containing them can be prebundled; no native-package exclusion
is required. Encoded source identities survive optimizer caches and server restarts.
Cached endpoint requests respect Vite filesystem permissions. Configure a package's
JSX runtime in both Vite and the optimizer if publishing JSX source; the adapter
owns CSS and does not select a JSX framework.

Compiled graphs are cached per entry and invalidated by affected style or asset
changes. Sources and image assets are watched, class declarations refresh after
style changes, and ordinary JSX CSS is invalidated before a full-page reload.
Full reloads keep class strings and native sheets consistent without a browser
CSS compiler or mutable-sheet runtime.

SSR, cross-document sheet adoption, runtime asset-URL expressions, and standalone
CDN builds remain outside the supported native-sheet contract. CSS import
conditions/layers still follow the compiler's restricted source contract.

## Verification

```sh
pnpm --filter @neon-kit/vite-plugin-style-build test
pnpm exec playwright install chromium firefox
pnpm test:style-slice
```

The browser proof packs temporary copies through the compiler/plugin prepack
conventions and installs tarballs in an isolated app. It checks native assets,
source maps, typed imports, optimizer caching, style/image edits, shared sheets,
lazy entries, vanilla CSS, and a separate documentation build in Chromium and
Firefox. Artifacts are retained in its reported temporary directory.

The shadow-rendering proof installs the published Slimlib packages at the
versions used by this repository. `@slimlib/element@0.5.0` provides
`shadowStyles()`; no sibling checkout is required.
The adapter itself does not depend on a rendering runtime.
