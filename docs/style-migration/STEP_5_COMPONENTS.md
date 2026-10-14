# Step 5: component renderers and shared styles

Completed 2026-10-13. Step 6 remains pending.

## Rendering contracts

Combobox, multicombobox, datepicker, and timepicker now render their generated
fields, popovers, listboxes, and ARIA ID references inside one open shadow root.
They consume native theme CSS Modules through `?neon` and adopt the shared token,
shadow-base, and form-host layout sheets. The internal wrapper retains the
component's intrinsic minimum; consumers can size the host with ordinary CSS.
Icons render their SVG inside a shadow root, inherit host size/color, and expose
accessibility through the host rather than a duplicate SVG role.

Authored combobox options remain light-DOM children. Option observation, public
values, form submission/reset, validation anchors, disabled/read-only states,
keyboard behavior, and focus forwarding remain supported. Light-tree labels and
explicit ARIA label/description IDs are resolved in the host's containing tree
and assigned to the generated controls through ARIA element references. Input
and change events cross an enclosing application shadow root. Multicombobox
cleans up its imperative wrapper on a real disconnect before remounting.

Menu, menu-item, and tooltip hosts use a default shadow slot for authored
children. The menu or tooltip host remains the popover in its original tree;
external invokers, nested menu discovery, consumer-owned ARIA IDs, and tooltip
trigger references retain their tree identity. Consumer-authored rich content
uses document CSS, including ordinary theme CSS Modules for helper roles.
Detailed named slots and parts remain future work.

Menu placement is a host attribute/property: `block-end` (default), `block-start`,
`inline-start`, or `inline-end`. Root and modifier classes belong to the component.
Menu focus restoration runs before native closing can clear focus in Firefox;
the queued toggle handler still owns open-menu coordination. Tooltips use fixed
positioning, verified with fixed triggers and document scrolling in both engines.

JSX menu and tooltip entries import ordinary CSS Modules and use Vite's class
maps in light DOM. Composed class strings are handled as multiple classes, and
selectors match every composed class. The shared tooltip controller accepts
positional class bindings for renderer-specific roots and placement modifiers.

## Host stylesheet projection

An adopted `.menu` rule cannot select the host. Native imports can now specify
`?neon&host=menu` (or `menu__item` / `tooltip`). The compiler expands nesting and
projects that export's leading root compound and composed helpers onto
`:host(...)`. States stay inside that compound; pseudo-elements stay outside it.
Descendants retain scoped classes. Source maps retain authored source content.

Host variants have distinct compiler/Vite cache identities and emitted CSS.
Unchanged token and base sheets remain shared. This projection is intentionally
limited to a root class directly in the leading compound; it does not infer host
ownership from arbitrary ancestors or classes nested inside `:is()`.

Web-component metadata retains custom-element registration side effects. JSX
metadata marks CSS side effects. Both depend on the theme's source exports;
renderer builds preserve the appropriate CSS imports for the consumer pipeline.
Exact native import declarations are generated for web-component authoring;
declaration files are excluded from Rollup's JavaScript entry discovery.

## Documentation isolation

Every WC/JSX/icon example renders in a separate, same-origin document. The main
shell retains its classical stylesheet, while the example document imports
ordinary CSS Modules for authored markup and its own document reset/font entry.
It loads no vanilla catalogue. Native sheets style shadow internals.

Navigation from CSS to WC to JSX replaces the example document. Parent scheme
and public property overrides are mirrored into it. A height handshake plus
resize observation keeps the complete example visible. Form demonstrations run
in their owning document. JSX menu now has a production prerendered route.
The historical capture helper follows renderer frames and inspects shadow nodes;
previous evidence directories are unchanged.

## Validation

| Check | Result |
| --- | --- |
| Web components | 168 tests in Chromium; 168 in Firefox |
| JSX components | 27 tests in Chromium; 27 in Firefox |
| Core browser helpers | 13 tests |
| Style compiler | 8 tests, including composed host roots, nesting, pseudo-elements, and original maps |
| Vite adapter | 7 tests, including simultaneous host/unprojected variants and shared base output |
| Classical menu layout | 3 tests |
| Core / WC / JSX declarations | Builds and public type-consumer checks pass |
| WC / JSX / compiler / Vite source types | Strict checks pass |
| Built renderer consumers | Development and production in Chromium 147.0.7727.15 and Firefox 148.0.2 |
| Documentation | 72 route/scheme/browser/mode cases plus 4 navigation/override cases |

The [browser summary](step-5/summary.json) contains 84 scenarios: 8 built-consumer
cases, 72 documentation cases, and 4 navigation cases. The directory also holds
36 complete production screenshots. Google Fonts are disabled for deterministic
captures; the example documents still own their font-loading entry.

Built-consumer checks use package exports and compiled renderer JavaScript with
no source aliases. The WC consumer has no document stylesheet and checks shared
sheet identity, labels/focus, forms/reset, keyboard selection, external popovers,
slots, icon size/color, inherited/forced schemes, and public overrides. The JSX
consumer uses no native-sheet plugin. Documentation checks exclude vanilla
selectors from the renderer document and exercise form submission and resizing.

To repeat the proof from a fresh checkout:

```sh
pnpm build
node docs/style-migration/verify-renderers.mjs
```

For Firefox component suites, run `NEON_TEST_BROWSER=firefox pnpm --filter
@neon-kit/web-components exec vitest run --config ../vitest.config.js` (substitute
`@neon-kit/jsx-components` for JSX). Chromium uses the regular package test scripts.
Firefox runs without V8 coverage because that provider only supports Chromium.

Packed release consumers, publication metadata/exports, the final package cutover,
and Tailwind dependency removal remain step 6. This step does not claim a packed
release gate or a CDN distribution.
