# @neon-kit/vite-plugin-style-build

Initial Vite adapter for the [style migration slice](../docs/style-migration/STEP_2_PROOF.md).
It depends on `@neon-kit/style-build` for CSS Modules compilation and emits
native CSS module scripts for shadow roots. Ordinary `.module.css` imports
continue through Vite's CSS Modules pipeline.

## Configuration

```js
import { defineConfig } from 'vite';
import { styleBuild } from '@neon-kit/vite-plugin-style-build';

export default defineConfig({
    plugins: [styleBuild()],
    // Keep packages containing ?neon imports out of dependency prebundling.
    optimizeDeps: { exclude: ['@neon-kit/web-components'] },
    // Preserve light-dark() in the ordinary JSX CSS output as well.
    build: { cssTarget: ['chrome128', 'firefox128'] },
});
```

The adapter targets Vite 8 and browsers supporting native CSS module scripts.
The proof runs in Chromium and Firefox. The CSS target above preserves native
`light-dark()`; Vite's default CSS lowering otherwise uses generated helper
variables that do not follow the fixture's dynamically inherited scheme.

## Imports

```js
import { button, sheets } from './button.module.css?neon';
import { sheets as base } from './shadow-base.css?neon';

// Adopt [...base, ...sheets] in the component's shadow root.
// Use button as its class string, including any composed classes.
```

Each CSS Modules export becomes a named string export. `sheets` contains the
dependency-ordered `CSSStyleSheet` objects, with each source sheet included
once in that graph. The name `sheets` is reserved. A plain shadow-only `.css`
entry can also use `?neon` and exports its sheets without class exports.

Production output contains shared CSS assets and generated JavaScript facades
with `with { type: 'css' }` imports. Facades are emitted as raw assets so Vite
does not strip their import attributes or inject shadow CSS into the document.
Development serves equivalent raw endpoints under the configured base path.
Component instances and lazy entries importing a shared URL use the same sheet
object. Stylesheet source edits currently reload the page.

## Current scope

The adapter supports the compiler's local composition/import graph and Vite
resolution, including package CSS exports. It rejects `url()` asset references
and SSR. Asset rewriting, source maps, typed `?neon` authoring declarations,
broader optimizer integration, and finer development updates are step 3 work.

The shadow rendering fixture requires a Slimlib candidate exposing
`shadowStyles()`; the installed `@slimlib/element@0.4.1` does not expose it.
The adapter itself does not depend on a rendering runtime.

## Verification

From the repository root:

```sh
pnpm exec playwright install chromium firefox
pnpm test:style-slice
```

By default the proof packs the local `../slimlib/element` candidate. Set
`NEON_SLIMLIB_ELEMENT` to another candidate package directory if necessary.
It installs tarballs into an isolated app and checks development and production
in both browsers, including a JSX-only Vite configuration without this plugin,
plain aggregate/selective CSS, shared sheets, lazy loading, scheme inheritance,
and a separate documentation build. Review artifacts are retained in the
reported temporary directory.
