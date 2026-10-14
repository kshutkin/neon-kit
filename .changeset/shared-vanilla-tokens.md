---
"@neon-kit/theme-vanilla": minor
---

Add a shared tokens.css entry for selective CSS consumption. Import it once
alongside component, effect, or document theme entries, which no longer embed
token defaults. Keep index.css self-contained with exactly one copy of tokens.
