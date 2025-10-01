# Project Shadow System: A Deep Dive

This document outlines the custom shadow system used in this project, explaining how it differs from the standard Tailwind CSS defaults.

Our project's shadows are more complex and serve more specific UI purposes than Tailwind's defaults, which are primarily for simple elevation. They fall into four distinct categories.

### 1. Standard Drop Shadows

This is the most conventional type of shadow, used to lift an element off the page.

*   **Project's Implementation:**
    *   `0_1px_2px_rgba(0,0,0,0.1)`
    *   `0_1px_1px_rgba(0,0,0,0.05)`
    *   `0_1px_2px_var(--color-shadow-strong-dark)`
*   **Comparison to Tailwind:**
    *   This is the most **similar** category to Tailwind's defaults (`shadow-sm`, `shadow-md`).
    *   However, our shadows are very subtle (`1px` or `2px` blurs) and are always used as part of a composite shadow (e.g., combined with an `inset` highlight). We do not use large, diffuse drop shadows like Tailwind's `shadow-lg` or `shadow-2xl`.

### 2. Inset Top-Edge Highlights (Accents)

This is a key feature of our design system. These shadows create a subtle, 1-pixel light border on the *inside top edge* of an element, giving it a slight 3D sheen.

*   **Project's Implementation:**
    *   `inset_0_1px_rgba(255,255,255,0.3)` (light mode)
    *   `inset_0_1px_var(--color-shadow-surface-dark)` (dark mode)
    *   `inset_0_1px_var(--color-shadow-surface)`
*   **Comparison to Tailwind:**
    *   This is **completely different**.
    *   While Tailwind has a `shadow-inner` utility, it's a soft, gray, diffused inner shadow. Our implementation is a precise, sharp, 1-pixel line used as a highlight.

### 3. Inset Press/Active State Shadows

This shadow simulates a "pressed-in" effect when a component like a button is clicked.

*   **Project's Implementation:**
    *   `inset_0_1px_2px_var(--color-shadow)` (light mode)
    *   `inset_0_1px_2px_var(--color-shadow-dark)` (dark mode)
    *   `inset_0_1px_var(--color-shadow-primary)` (for CTA buttons)
*   **Comparison to Tailwind:**
    *   This is **conceptually similar** to Tailwind's `shadow-inner`, but our implementation is customized for our theme's colors and is specifically tied to the `:active` state of buttons. It's a functional UI shadow, not a decorative one.

### 4. Outer Focus Rings

This shadow is used exclusively for accessibility (`:focus-visible`) to draw a colored ring *around* an element, indicating keyboard focus.

*   **Project's Implementation:**
    *   `0_0_0_2px_var(--color-shadow-focus)` (light mode)
    *   `0_0_0_2px_var(--color-shadow-focus-dark)` (dark mode)
*   **Comparison to Tailwind:**
    *   This is **functionally identical** to Tailwind's `ring` utilities (e.g., `ring-2`).
    *   The main difference is that our project implements this using the `box-shadow` property, whereas Tailwind has a dedicated `ring` property and utilities. Both achieve the same visual result.

### Summary of Differences

| Shadow Type | Project Implementation | Standard Tailwind Equivalent | Key Difference |
| :--- | :--- | :--- | :--- |
| **Drop Shadow** | Subtle, and always part of a composite shadow. | Standalone `shadow-sm`, `shadow-md`, etc. | Yours are for subtle definition, not major elevation. |
| **Top Highlight** | Sharp, 1px `inset` white/light line. | `shadow-inner` (soft, gray). | **Completely different.** Yours is a precise highlight. |
| **Pressed Effect** | `inset` shadow tied to `:active` state and theme colors. | `shadow-inner`. | Yours is a functional, state-dependent shadow. |
| **Focus Ring** | `box-shadow` with 0 blur (e.g., `0 0 0 2px`). | `ring` utilities (e.g., `ring-2`). | **Same result**, different technical implementation. |
