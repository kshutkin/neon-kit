# Multi-theme migration plan

Move neon-kit from the current paired-token model (`--color-x` +
`--color-x-dark`, consumed via Tailwind `dark:` variants) to a
daisyUI-style scoped-token model: a single set of semantic tokens,
swapped wholesale by `[data-theme="<name>"]` blocks, with components
referencing tokens through one branch only.

This document is a plan, not a change. Execute it as a single
coordinated PR (or a short PR series, see "Phasing" below).

---

## 1. Goals

1. **Decouple component cost from theme count.** Today, adding a third
   theme means writing a `light:` / `forest:` / etc. variant for every
   token reference in component CSS. After the migration, a new theme
   is one extra CSS block of variable overrides — components are
   untouched.
2. **Single source of truth per token.** Components reference
   `--color-surface`, not `--color-surface` *and* `--color-surface-dark`
   in parallel. Less surface area for drift.
3. **Keep the perceptual design intact.** Same colors, same ramps, same
   focus-ring math. The token *names* stay; only their *resolution
   mechanism* changes.
4. **Keep ergonomics for docs authors.** Markup should not need
   `dark:` paired classes everywhere — the same `bg-surface` class
   produces the right value in any theme.

## 2. Non-goals (for this migration)

- Adding new themes beyond `light` and `dark`. The migration is the
  enabling work; new themes ship in follow-up PRs.
- Changing the OKLCH ramp math, the focus-ring contrast strategy, or
  the neutral hue / chroma controls. Those formulas move with the
  tokens, unchanged.
- Adding daisyUI-style `*-content` foreground pairs. That is a
  separate, larger redesign and should be debated on its own merits
  (see "Future work").
- Touching `web-components/src/`. It currently has zero `dark:` usages
  and zero direct `--color-*-dark` reads (verified). It will benefit
  automatically.

## 3. Current architecture (baseline)

### 3.1 Tokens — `theme/theme.css`

- A single `@theme default { … }` block defines:
  - Two base lightness anchors: `--color-neutral`, `--color-neutral-dark`.
  - All semantic tokens (`--color-surface`, `--color-ink-primary`,
    `--color-border`, `--color-primary`, status colors, etc.) derived
    via `oklch(from …)` from the anchors.
  - For most semantic tokens, a sibling `--color-x-dark` derived from
    the dark anchor with the same formula.
- ~9 explicit `*-dark` token definitions (`neutral-dark`, `surface-dark`,
  `primary-dark`, `border-dark`, `success-dark`, `warning-dark`,
  `error-dark`, `info-dark`, `accent-dark`). The remaining `*-dark`
  variants are derived inline from these.
- 226 lines total.

### 3.2 Components — `theme/components/*.css`

- Authored as Tailwind v4 with `@apply` and nested rules.
- Reference both branches everywhere a themed token appears:
  ```css
  .table {
      @apply bg-surface dark:bg-surface-dark
          border-border dark:border-border-dark;
  }
  ```
- **184 `dark:` occurrences** across `theme/components/`.

### 3.3 Theme switch — `site/theme-switcher.js`

- Sets `document.documentElement.dataset.theme = "light" | "dark"`.
- Persists choice in `localStorage`.
- The Tailwind `dark:` variant is wired to the same attribute via
  Tailwind v4's `@custom-variant` (or default `[data-theme=dark]` /
  `prefers-color-scheme`) — components opt in by writing `dark:foo`.
- Also exposes a primary-color tuner that writes
  `--primary-lightness` / `--primary-chroma` / `--primary-hue` on
  `:root`. **This stays unchanged** — those are inputs to the OKLCH
  derivation, not token aliases.

### 3.4 Docs markup — `site/sections/*.html`

- Uses `dark:` Tailwind utilities heavily for backgrounds, borders,
  text colors on panels, captions, and helper text.
- **1160 `dark:` occurrences** across `site/sections/`. The bulk of
  the migration churn is here.

## 4. Target architecture

### 4.1 Tokens — `theme/theme.css`

- Keep the **same semantic names** (`--color-surface`, `--color-ink-primary`,
  etc.) but drop the `*-dark` siblings.
- Move all token *values* out of `@theme default` and into per-theme
  blocks:
  ```css
  @theme default {
      /* Non-themed primitives stay here: --font-sans,
         --color-neon-*, structural variables like --neutral-hue,
         --primary-lightness, --state-target-lightness, etc. */
  }

  /* Light theme — the default. */
  :root,
  [data-theme="light"] {
      color-scheme: light;
      --color-neutral: oklch(90% var(--neutral-chroma) var(--neutral-hue));
      --color-ink-primary: var(--color-neutral-dark-anchor); /* renamed */
      --color-surface: oklch(from var(--color-neutral) calc(l + 0.08) var(--surface-chroma) h);
      /* …all derived tokens, identical formulas to today’s light branch… */
      --state-target-lightness: 0.68;
  }

  [data-theme="dark"] {
      color-scheme: dark;
      --color-neutral: oklch(25% var(--neutral-chroma) var(--neutral-hue));
      --color-ink-primary: oklch(95% 0.005 200); /* current ink-primary-dark formula */
      --color-surface: oklch(from var(--color-neutral) calc(l - 0.1) var(--surface-chroma) h);
      /* …same set of names, dark-branch formulas… */
      --state-target-lightness: 0.78;
  }
  ```
- Rationale: components don’t care which theme is active; they read
  `var(--color-surface)`. The cascade resolves it inside whichever
  `[data-theme=…]` scope they sit in.
- Anchor renames: `--color-neutral-dark` is currently both "the dark
  branch of neutral" *and* "the source of ink-primary in light mode."
  Split those concerns:
  - `--neutral-anchor-ink` (light: ~25% L) — derives ink colors.
  - The theme’s own `--color-neutral` (light vs dark) carries the
    surface ramp.
  - This split is required; today it’s a load-bearing coincidence
    that the dark neutral happens to be at the right L for light-mode
    ink. Document the new split explicitly.

### 4.2 Tailwind hook-up

Two options. Pick one — **option A is recommended.**

**Option A: Drop `dark:` from authoring entirely.**
- Remove the `@custom-variant dark` wiring (if any). Components and
  docs write `bg-surface`, `border-border`, `text-ink-primary` —
  values resolve automatically inside the active `[data-theme]`
  scope.
- Pros: minimal authoring, scales to N themes for free, matches
  daisyUI ergonomics.
- Cons: utility classes that need to differ per theme structurally
  (e.g. different *layout* in dark mode — rare in this repo) have no
  built-in escape hatch. Mitigation: write a scoped rule
  `[data-theme="dark"] .my-thing { … }`.

**Option B: Keep `dark:` as a per-theme variant, retire only `*-dark` tokens.**
- Configure `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`
  so `dark:bg-surface` still works — but it now applies the
  light-token `bg-surface` rule inside the dark scope, which would
  *double*-resolve to the dark value. This is meaningless: prefer A.
- Only useful if we want `dark:` to mean "extra rules that only fire
  in dark mode" rather than "same rule, different color." That use
  case is rare here.

**Recommendation:** Option A. Remove `dark:` from the codebase. If a
future theme needs a structural override, write a plain
`[data-theme="x"] .selector` rule.

### 4.3 Components — `theme/components/*.css`

Every paired declaration collapses:

```css
/* Before */
.table {
    @apply border-border dark:border-border-dark
        bg-surface dark:bg-surface-dark;
}

/* After */
.table {
    @apply border-border bg-surface;
}
```

For nested rules using the `:where([data-theme="dark"])` form (present
in some components, e.g. combobox, datepicker, tooltip — the
generated CSS shows many `&:where([data-theme="dark"], [data-theme="dark"] *)`
fragments), the second branch is deleted entirely.

184 `dark:` references → 0. Estimated component CSS reduction:
~30–40% of total lines in `theme/components/`.

### 4.4 Theme switch — `site/theme-switcher.js`

- **The mechanism is already correct.** It already sets
  `data-theme="light"` or `"dark"` on `<html>`.
- Action: verify it still runs *before* first paint to avoid a FOUC.
  Today the `dark:` variant lets unswitched HTML render as light by
  default; after the migration, no theme attribute → `:root` block
  applies → still light. Same result, but worth a regression check.
- The primary-color tuner is unaffected: it writes
  `--primary-lightness`/`-chroma`/`-hue` on `:root`, and those feed
  *both* theme blocks’ derivation formulas. (Verify: the dark theme
  must reference the same root-scoped tuner variables, not redefine
  them.)
- New affordance to add later (out of scope for this PR): if more
  themes ship, replace the binary toggle with a `<select>` driven by
  the same `data-theme` attribute. Cheap.

### 4.5 Docs markup — `site/sections/*.html`

1160 paired utilities collapse to single utilities. Mostly mechanical:

```diff
- <div class="rounded-lg border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark">
+ <div class="rounded-lg border border-border bg-surface p-4">
```

A regex-driven sweep handles most of it (see "Mechanical sweep"
section below). The remaining cases worth a manual look:

- Anywhere `dark:` switches a *different* utility (e.g. `text-white dark:text-black`
  with no underlying token) — rare here but easy to grep for.
- Anywhere a `dark:` utility uses a token suffix that does **not**
  match the light side (e.g. `bg-surface dark:bg-surface-secondary-dark`).
  These are intentional design choices and must be redesigned, not
  swept. Audit before the sweep.

## 5. Design considerations

### 5.1 The `*-content` question (deferred)

daisyUI’s strongest idea is that every fill ships with its paired
foreground (`--color-primary-content`). This repo currently uses
`--color-ink-inverse` as a global "text-on-strong-fill" token and
relies on conventions like "ink-inverse is always readable on
`primary`." That holds today because primary has bounded lightness,
but it’s a latent constraint.

**Decision for this migration:** keep `--color-ink-inverse` as-is.
Don’t introduce `-content` pairs yet. Revisit after the migration is
stable, with a separate ADR.

### 5.2 Focus-ring contrast strategy

`--color-border-focus` is computed as
`oklch(from var(--color-primary) min(l, 0.38) c h)` and the comments
in `theme.css` document the exact contrast ratios against each
surface. After the migration, this same formula sits inside each
theme’s block, so contrast must be re-verified in dark mode against
the dark-mode surface ramp. If today’s dark mode passes, the new
arrangement passes too — same surfaces, same primary, same formula.
Add a verification step to the migration (see "Validation").

### 5.3 OKLCH `from …` across theme scopes

`oklch(from var(--color-x) …)` resolves at the cascade level where
`--color-x` is set. Because the new arrangement defines tokens *inside*
the theme scope, derivations work correctly without any change — but
this needs to be tested early in case `@theme default` interacts with
the cascade in a non-obvious way under Tailwind v4. Spike at the
start of phase 1.

### 5.4 The `[data-theme="x"]` selector and nesting

Nesting (`<html data-theme="dark"><div data-theme="light">…</div></html>`)
becomes free. Today, nesting works for `[data-theme=dark]`-scoped
rules but breaks for any `dark:` Tailwind variant whose selector is
`html.dark` or `[data-theme=dark]` matched at the root. Document the
new nesting behavior in `docs/adr/` and add a one-paragraph note to
`theme/README.md`.

### 5.5 Prefers-color-scheme

Today the user’s OS preference can be honored by the theme switcher
on first load. After the migration, the rule
`@media (prefers-color-scheme: dark) { :root { /* dark tokens */ } }`
can be added as a *fallback* when no `data-theme` attribute is
present:

```css
@media (prefers-color-scheme: dark) {
    :root:not([data-theme]) { /* dark tokens, same as [data-theme=dark] */ }
}
```

Or — simpler — keep the JS the source of truth and have it apply
`data-theme` early. Pick one; do not mix.

### 5.6 CSS bundle size

The pre-migration CSS contains every component rule twice (once for
light, once nested under `:where([data-theme="dark"], …)`). Removing
the dark branches roughly halves the component-CSS payload. Tokens
get a small *increase* (two `:root` / `[data-theme=dark]` blocks
instead of one combined `@theme`), but it’s negligible compared to
the component-CSS savings.

### 5.7 Risk: silent token rename

Anything outside the workspace that imports `@neon-kit/theme` and
reads `--color-surface-dark` directly will break. Audit:

- `web-components/src/` reads from CSS variables but my earlier grep
  showed 0 hits for `dark:` — also need to grep for direct
  `--color-*-dark` reads in JS/CSS string literals.
- `site/*.js` files (theme-switcher.js, combobox.js, etc.) — same
  audit.
- Any consumer outside this repo (search `npm` consumers? Probably
  none yet given pre-1.0 status, but worth a check before publish).

If found, those reads switch to the bare token name and resolve to
the active theme automatically.

## 6. Phasing

Three PRs, each shippable independently and each leaving the docs
site green.

### Phase 1 — Tokens & theme switch (smallest, riskiest)

- Restructure `theme/theme.css` into `@theme default` (non-themed
  primitives) + `:root, [data-theme="light"] { … }` + `[data-theme="dark"] { … }`.
- Keep `*-dark` siblings *as aliases* during this phase:
  ```css
  [data-theme="light"] {
      --color-surface: …;
      --color-surface-dark: …; /* still emitted, same value as in old @theme */
  }
  ```
  This lets the existing `dark:` utilities in components and docs
  keep working unchanged.
- Verify: dark-mode toggle still produces visually identical output
  to `main`. Run Playwright snapshot diffs across all docs pages in
  both themes.
- Exit: `theme/theme.css` is reorganized but the rest of the repo is
  byte-identical in its compiled output.

### Phase 2 — Component CSS

- Sweep `theme/components/*.css`: remove every `dark:` from `@apply`
  lines, remove every `:where([data-theme="dark"], …)` nested branch.
- Drop the `*-dark` aliases from `theme/theme.css` (they are now
  unreferenced).
- Verify: snapshot diffs again — pixel-identical, because each
  removed `dark:bg-surface-dark` now resolves through the same
  `bg-surface` token in the `[data-theme=dark]` scope.

### Phase 3 — Docs markup sweep

- Run the mechanical sweep across `site/sections/*.html`.
- Manually audit any leftover `dark:` to ensure none are doing
  structural overrides.
- Update `docs/adr/` with a new ADR documenting the theme model.
- Add a one-paragraph "Theming" note to `theme/README.md`.

## 7. Mechanical sweep

The bulk of the changes are removable token pairs. A safe rewrite
approach:

1. Build a list of token base names from `theme/theme.css`:
   `surface`, `surface-secondary`, `surface-hover`, `surface-active`,
   `surface-disabled`, `ink-primary`, `ink-secondary`, `ink-muted`,
   `border`, `border-secondary`, `border-primary`, `border-focus`,
   `border-disabled`, `primary`, `primary-hover`, `primary-active`,
   `primary-disabled`, `accent`, `success`, `warning`, `error`,
   `info`, `shadow-base`, `shadow-surface-base`.
2. For each base name `X`, in every `.html` and `.css` file:
   - Replace ` dark:bg-X-dark` with `` (delete)
   - Replace ` dark:border-X-dark` with `` (delete)
   - Replace ` dark:text-X-dark` with `` (delete)
   - …repeat for every Tailwind color utility prefix actually used.
3. Run `pnpm build:docs && pnpm -r build` and Playwright snapshots.
4. Grep for any residual `dark:` — manually review each.

Implement step 2 as a Node script under `scripts/migrate-themes.mjs`
(throwaway, delete after the migration lands). Do not push the
script to `main`.

## 8. Validation

- **Unit-level:** existing `pnpm -r test` (Vitest browser mode) must
  pass at each phase. No test changes expected.
- **Visual:** Playwright screenshot tests against the docs site, in
  both `data-theme="light"` and `data-theme="dark"`. Snapshots taken
  on `main` before phase 1, compared against each phase. Pixel-diff
  threshold: 0. Any drift is a regression.
- **Contrast:** re-run the manual contrast notes in
  `theme/theme.css` against the dark surfaces. Document any
  surprise.
- **A11y:** focus rings, disabled states, error borders — eyeball in
  both themes after each phase.

## 9. Rollback plan

- Phase 1 is the only phase that touches `theme/theme.css` shape.
  Rollback = `git revert` the single phase-1 PR; aliases were
  preserved on purpose so phase 1 is observable-equivalent.
- Phases 2 and 3 are independent sweeps. Each is reversible by
  revert without coordination.

## 10. Future work (out of scope)

- **Add themes.** Once the model is in place, a new theme is one
  `[data-theme="forest"] { … }` block plus a docs-site picker entry.
- **`*-content` foreground tokens.** Adopt daisyUI’s pairing
  discipline. Requires touching every component that today depends
  on `--color-ink-inverse` heuristics. ADR first.
- **CDN bundle.** A future "shadow-DOM / CDN" mode (ADR-0001) can
  inline the theme tokens at root so consumers without Tailwind get
  themed components out of the box.
- **Theme picker in docs.** Replace the binary light/dark toggle
  with a `<select>` once there are >2 themes.

---

## Appendix A — Inventory snapshot (at planning time)

- `theme/theme.css`: 226 lines, ~9 explicit `*-dark` token definitions.
- `theme/components/*.css`: **184** `dark:` references.
- `site/sections/*.html`: **1160** `dark:` references.
- `web-components/src/`: **0** `dark:` references (clean).
- Theme switch: `site/theme-switcher.js`, sets `data-theme` on `<html>`.
