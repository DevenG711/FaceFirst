---
inclusion: fileMatch
fileMatchPattern: "**/*.{svelte,css,json}"
---

# Design & Accessibility

Users are stressed, may be older, may be holding a phone one-handed, and may not read English. Design for that.

## Color tokens (CSS custom properties in `src/app.css`)

Dark, calm theme (see `src/app.css` for the full set, including soft text and tag backgrounds).

| Token | Value | Use |
|---|---|---|
| `--color-act` | `#E8654F` | CALL_911_NOW: big Call 911 button, red status |
| `--color-act-text` | `#0D1014` | Text on `--color-act` |
| `--color-act-soft` | `#F59A88` | Red text on the dark background (911 outline button, CALL 911 headline) |
| `--color-caution` | `#E8B04B` | CANNOT_RULE_OUT and RETRY_CAPTURE status |
| `--color-caution-soft` | `#F2C46D` | Amber text on the dark background |
| `--color-bg` | `#0D1014` | Default background |
| `--color-surface` | `#171B21` | Panels and cards |
| `--color-fg` | `#F3F1EC` | Default text |
| `--color-accent` | `#D9C49B` | Primary buttons, progress, guides. Neutral, not a status color |
| `--color-focus` | `#D9C49B` | Focus ring (3px solid, 4px offset) |

- Never use green on result screens or the EMS card. No green "success" checkmarks after a check completes either; use neutral progress indicators.
- All text/background pairs meet WCAG 2.2 AA (4.5:1 body, 3:1 large text). Verify contrast when adding a new pair.

## Typography

- Base font size 20px; body line-height 1.5.
- Headings: Instrument Serif (h1 2.6–4.2rem, fluid), with the key phrase in italic accent. Body: Inter.
- Result screen headline ("Call 911 now."): ≥ 48px, in the red soft tone.
- Webfonts load from Google Fonts with system fallbacks; nothing, including the 911 button, waits on them.

## Layout & interaction

- Tap targets ≥ 56×56 px; primary buttons full-width on mobile.
- The 911 button is a real `<a href="tel:911">` with an accessible name ("Call 911"), first in tab order, visible on every screen including camera views and errors.
- One-handed use: primary actions in the bottom half of the screen on mobile.
- Every check has a voice prompt (`speechSynthesis`) and an equivalent on-screen text prompt.
- Camera views: overlay a framing guide; show coaching text for quality failures ("Move closer", "Face the camera", "More light").
- Respect `prefers-reduced-motion`: disable progress-ring animation and pulsing; use static indicators.
- Provide visible focus styles; never `outline: none` without a replacement.
- Every input and button has a label; icons have `aria-label` or adjacent text.
- Announce result state changes with `aria-live="assertive"` on result screens.
- Set `lang` on `<html>` to the active locale.

## Language

- Supported: English, Spanish, Portuguese. Language switcher on home screen.
- Plain language, short sentences, reading level ≈ grade 6.
- All copy in `lib/i18n/*.json`; see `safety.md` for banned words.
