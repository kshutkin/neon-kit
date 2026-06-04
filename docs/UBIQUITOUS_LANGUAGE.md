# Ubiquitous Language

## Design System Primitives

| Term                | Definition                                                                 | Aliases to avoid         |
|---------------------|---------------------------------------------------------------------------|--------------------------|
| **Utility**         | A composable, atomic CSS rule used as a building block for components      | helper, mixin           |
| **Component**       | A reusable, styled UI element (e.g., button, input, tag)                   | widget, block            |
| **Panel**           | The base visual container with border, shadow, and background              | card, box                |
| **Surface**         | The background fill of a component or panel                                | bg, background           |
| **Ink**             | The text color used for content within components                          | text, font-color         |
| **Shadow**          | The drop or inset shadow providing depth/elevation cues                    | elevation, box-shadow    |
| **Affordance**      | A visible UI cue indicating interactivity (e.g., hover, focus ring)        | control, handle          |
| **State Token**     | A CSS variable representing a semantic state (e.g., error, warning, soft)  | state color, status var  |
| **Disabled Surface**| The visual style for a non-interactive (disabled) component                | disabled-bg, inactive-bg |
| **Focus Ring**      | The outline or border indicating keyboard focus                           | focus-outline, focus     |
| **Quiet Control**   | A low-emphasis, icon/button affordance for secondary actions               | ghost, subtle            |

## State and Behavior

| Term                | Definition                                                                 | Aliases to avoid         |
|---------------------|---------------------------------------------------------------------------|--------------------------|
| **Disabled Control**| A component state where interaction is blocked and visual cues are muted   | inactive, locked         |
| **Read-only**       | A state where content is visible but not editable, distinct from disabled  | view-only, frozen        |
| **CTA**             | Call-to-action button, styled for primary user action                      | primary, main-action     |
| **Soft State**      | A translucent background fill for non-critical state cues                  | soft-fill, pastel        |
| **Not-disabled**    | A selector/utility ensuring hover/active styles only apply when enabled    | enabled-only, active     |

## Relationships

- A **Component** is composed of one or more **Utilities**.
- **Panel** is the base for most Components, providing border, background, and shadow.
- **Disabled Control** applies **Disabled Surface** and blocks all interactive affordances.
- **Focus Ring** and **Quiet Control** are Utilities applied to Components for specific states.
- **State Tokens** (e.g., error, warning, soft) are used to theme Components semantically.

## Example dialogue

> **Dev:** "Why does the **disabled surface** look flat on some components but not others?"
> **Domain expert:** "Because the **disabled-surface** utility dials down the shadow and removes the highlight, but keeps some depth. If you want it totally flat, you can override with `shadow-none`."
> **Dev:** "How do I prevent hover styles on a **disabled control**?"
> **Domain expert:** "Use the `not-disabled:` utility. It ensures hover/active only apply when the control is enabled."
> **Dev:** "What's the difference between **read-only** and **disabled**?"
> **Domain expert:** "Read-only means you can see but not edit; disabled means you can't interact at all, and the UI is visually demoted."

## Flagged ambiguities

- "helper" and "mixin" are sometimes used for what are actually **Utilities** — prefer "utility" for atomic CSS rules.
- "primary" is overloaded: as a color, a button type, and a state. Use **CTA** for the main action button, and "primary" only for color tokens.
- "inactive" and "disabled" are sometimes conflated. Use **Disabled Control** for non-interactive, and "inactive" only for non-selected but still interactive elements.
