---
"@neon-kit/theme": patch
"@neon-kit/theme-vanilla": patch
"@neon-kit/style-build": patch
---

Keep composed panel defaults below component rules regardless of CSS Module
import order, fixing JSX menu grid alignment and padding when other modules load
later. Preserve these defaults on shadow hosts by projecting compound :where()
selectors through the native style compiler.
