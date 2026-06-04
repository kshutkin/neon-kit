# `@neon-kit/web-components` on `@slimlib/*` — migration notes

Working notes for rewriting the components on `@slimlib/element` +
`@slimlib/store` + `@slimlib/jsx`. Written after converting the first
three components (`icon`, `menu`, `tooltip`); read this before
converting the remaining ones (`combobox`, `multicombobox`,
`datepicker`, `timepicker`).

## The contract that must not change

Every component keeps the same public shape:

- A named constructor export `Neon<Name>Element`.
- A `register<Name>(tagName = 'neon-<name>')` that is **idempotent**
  and accepts a custom tag name.
- Side-effect registration on import (`register<Name>()` at module
  bottom).
- The same observed attributes, `data-*` behavior, public
  methods/getters, ARIA wiring, and DOM shape the existing tests assert.
- `src/index.js` re-exports the constructor + register fn.

Because `register<Name>(tagName)` must accept a custom tag and we export
the constructor, use `createCustomElement(middleware, render, Base?)` —
**not** `defineElement(tag, …)`, which registers immediately under a
fixed tag.

## `@slimlib/element` lifecycle — the part that bites

Verified from the package source:

- `render(() => userRender(host), host)` runs **once per mounted
  period**, guarded by an internal `#mounted` flag.
- `connectedCallback` emits `MOUNT` (first connect only) then `CONNECT`
  (every connect).
- `disconnectedCallback` is **async**: it emits `DISCONNECT`
  synchronously, `await`s a microtask, and only then — if the element is
  still disconnected — emits `UNMOUNT`, runs `onMount` cleanups, and
  disposes the render scope. This defers unmount so a synchronous
  detach+reattach (a "move") does not tear everything down.

Consequences:

| Need | Hook |
| --- | --- |
| Build owned DOM / start reactive effects once | render body / `onMount` |
| Wire/tear down behavior that must be **synchronous** on connect & disconnect (e.g. restoring a parent's attributes, asserted synchronously by tests) | `onConnect` / `onDisconnect` |

`onMount`'s cleanup is microtask-deferred, so anything a test checks
**synchronously after `el.remove()`** must be torn down in
`onDisconnect`, not in an `onMount` cleanup. `tooltip` restores the
parent's `aria-describedby` / `anchor-name` in `onDisconnect` for
exactly this reason.

## Synchronous DOM vs microtask-deferred effects — the central tension

`@slimlib/store` effects flush on a microtask. The existing components
expose **synchronous** imperative entry points (a property setter that
must repaint before the next line of a test, `setAttribute` that must
flip a class immediately, etc.).

Pattern that resolves it — **reactive internals, synchronous commit at
the boundary**:

1. Hold state in `signal()`s; derive DOM in `effect()`s.
2. At each synchronous public boundary (a property/method/attribute
   change), write the signal **then call `flushEffects()`** from
   `@slimlib/store`. This commits the pending effects in the same tick.
3. Do **not** call `setScheduler` to make effects globally synchronous —
   that would change scheduling for the whole app embedding the
   component. Keep the sync commit local to our own setters.

Used by `icon` (the `icon` property setter). Expect to need it again for
the combobox/datepicker/timepicker `value` setters when they need
synchronous public writes.

## `@slimlib/jsx` gotchas

- **Reactive function-children (`{() => node}`) reconcile via comment
  anchors** and threw `NotFoundError: insertBefore … not a child` when
  swapping `null ↔ <svg>` in `icon`. For "replace the whole subtree with
  one node or nothing", drive an `effect()` that calls
  `host.replaceChildren(node)` imperatively instead. You still build the
  node with JSX — you just don't hand the swap to the reconciler.
- **`jsx(type, props)` returns a real DOM `Node`** (from
  `createElementArray`). You can use a JSX expression standalone as an
  `appendChild` argument — `host.appendChild(<div class="…" />)` — no
  `render()` needed. `tooltip`'s arrow uses this.
- **Returned JSX is appended to the host, not used to replace existing
  children.** This means `tooltip` can return its owned arrow element
  while preserving author-provided tooltip content already inside the
  host.
- SVG needs the `svg()` namespace factory (`icon`).

## Attributes

`attributes({ name: [parse, serialize] })`:

- `observedAttributes` = keys that have a **parse** fn (`[0]`).
- A key with a **serialize** fn (`[1]`) is *reflected*: the middleware
  installs a `prop → attribute` effect. If you only want to **read** an
  attribute (no write-back), pass parse only: `[stringAttribute[0]]`.
- `attributeChangedCallback` for attributes **present at upgrade** fires
  **before** the render runs, so per-instance bridge handlers are not
  installed yet. Read initial attribute values from `getAttribute` in
  the render/`onConnect`, and treat the callback as "changes after
  mount".

## Keeping prototype API (getters / methods / `observedAttributes`)

`createCustomElement(mw, render, Base)` extends `Base`. Put
prototype-level surface there:

- `menu` puts its read-only getters (`activeItem`, `items`,
  `focusableItems`) on a `NeonMenuBase extends HTMLElement`.
- `tooltip` puts `static get observedAttributes`,
  `attributeChangedCallback`, and the public `showTooltip()` /
  `hideTooltip()` on `NeonTooltipBase`. Those delegate to per-instance
  implementations the render installs on the host via private
  `Symbol` keys (`this[SHOW]?.()`), bridging prototype API to the render
  closure.

## When `@slimlib/store` is *not* worth it

`menu` is a pure Light-DOM enhancer (roving tabindex + keyboard nav +
type-ahead). Its only "state" is a transient type-ahead buffer that
nothing renders or derives from. Forcing it into a signal adds
indirection for zero benefit, so it stays a plain closure variable and
all behavior lives in an `onMount` block (listeners + `MutationObserver`,
returning a cleanup). Use the store where something is **derived or
rendered**, not everywhere.

## Build / tooling state

- `src/*.jsx` compiled by `rollup-plugin-esbuild` (`jsx: 'automatic'`,
  `jsxImportSource: '@slimlib/jsx'`, `target: 'es2022'`),
  `preserveModules` → `dist/`. Non-JSX files stay `.js`. Rollup rewrites
  `.jsx` imports to the emitted `.js` chunks.
- `tsconfig.json`: `jsx: 'react-jsx'`, `jsxImportSource:
  '@slimlib/jsx'`, `include` covers `src/**/*.{js,jsx}`.
- Element entry modules can be `.jsx` directly (single-file components);
  specs import the `.jsx` path. `@slimlib/jsx` may still be used for
  genuine subcomponents in their own `.jsx` modules when that reads
  better — both work.
- `package.json`: `exports`/`main`/`module` → `./dist/*.js`,
  `files: ["dist","types"]`,
  `build: "rollup -c && tsc -p tsconfig.dts.json && dts-buddy ... -m
  <subpath>:.dts/<entry>.d.ts"` (one `-m` per public entry),
  `prepack: "pkgprn --flatten types,dist"`. **Never** run `pnpm pack`
  locally — `pkgprn --flatten` rewrites the source tree destructively.
- `.dts/` (tsc output) and `dist/` are gitignored.

### Type generation: tsc emit → dts-buddy bundle (the entry rule)

`dts-buddy`'s *own* declaration emit **dumps raw JSX source** (an
invalid `.d.ts` that `tsc` rejects) when a `-m` entry is a `.jsx` file.
**Do not point `dts-buddy` at `.jsx` source.** Instead:

1. `tsc -p tsconfig.dts.json` (`emitDeclarationOnly`, `checkJs:false`,
   `outDir:.dts`) emits one clean `.d.ts` per source file — `tsc`
   handles `.jsx` declaration emit correctly, and `checkJs:false` keeps
   emit ungated by source type-soundness (still honoring `@type` /
   `@typedef`). `declarationMap:true` preserves go-to-def.
2. `dts-buddy` bundles the generated **`.d.ts`** entries
   (`-m <subpath>:.dts/<name>.d.ts`) into the single
   `types/index.d.ts`. dts-buddy explicitly supports `.d.ts` entries.

This lets element entries be `.jsx` and produces valid declarations.

### Restoring the public type surface

`createCustomElement` is typed `new (...) => HTMLElement &
MergeInstanceExts<M>`. It **drops the `ElementBase` members and any
dynamically-added props** — only the `attributes()` middleware keys
survive in the type. To keep the documented public API (`menu.items`,
`tooltip.showTooltip()`, `icon.icon`, and the element name being usable
as a *type*), re-type each export explicitly:

```js
// base-backed element (tooltip, menu): expose the base as the public type
/** @typedef {NeonTooltipBase} NeonTooltipElement */
/** @type {new (...params: any[]) => NeonTooltipElement} */
export const NeonTooltipElement = createCustomElement([], render, NeonTooltipBase);

// element with a dynamic prop (icon): intersect the impl instance type
const Impl = createCustomElement([attributes({ /* … */ })], render);
/** @typedef {InstanceType<typeof Impl> & { icon: IconDef | undefined }} NeonIconElement */
/** @type {new (...params: any[]) => NeonIconElement} */
export const NeonIconElement = Impl;
```

These `@type` casts are unsafe widening→narrowing, so they only emit
cleanly because the `.d.ts` build uses `checkJs:false`. `tsc -p
tsconfig.json` (the `checkJs:true` config) still reports them — a known
latent gap inherited from `createCustomElement`'s loose typing; not
gated by the build today.

`tests/types.ts` is the contract to keep green (`icon.icon`,
`menu.items`, `NeonTooltipElement` as a type with `showTooltip` /
`hideTooltip`, `combobox.value` / `.options` / `.checkValidity()`).
