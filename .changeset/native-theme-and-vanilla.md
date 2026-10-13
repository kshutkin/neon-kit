---
"@neon-kit/theme": minor
"@neon-kit/theme-vanilla": minor
---

Replace Tailwind style sources with shared CSS Modules, ordinary token defaults,
document and shadow resets, and native color-scheme/light-dark() theming.

Add the separate theme-vanilla package with a complete plain CSS bundle,
selective component groups, public class mappings, composed dependencies,
and portable asset URLs. Font loading remains document-owned.

Use --neon-* for public custom properties and --_* for internal defaults and
working values. Remove authored vendor-prefixed declarations and selectors;
browser compatibility transformations belong to the consumer build pipeline.
