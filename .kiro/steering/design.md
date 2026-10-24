---
inclusion: fileMatch
fileMatchPattern: "**/*.{svelte,css,json}"
---

# Design & Accessibility

Users are stressed, may be older, may be holding a phone one-handed, and may not read English. Design for that.

## Color tokens (CSS custom properties in `src/app.css`)

| Token | Value | Use |
|---|---|---|
| `--color-act` | `#C62828` | CALL_911_NOW screen, 911 button |
| `--color-act-text` | `#FFFFFF` | Text on `--color-act` |
| `--color-caution` | `#F9A825` | CANNOT_RULE_OUT and RETRY_CAPTURE screens |
| `--color-caution-text` | `#1A1A1A` | Text on `--color-caution` |
| `--color-bg` | `#FFFFFF` | Default background |
| `--color-fg` | `#111111` | Default text |
| `--color-focus` | `#1565C0` | Focus ring (3px solid, 2px offset) |

- Never use green on result screens or the EMS card. No green "success" checkmarks after a check completes either; use neutral progress indicators.
- All text/background pairs meet WCAG 2.2 AA (4.5:1 body, 3:1 large text). Verify contrast when adding a new pair.

## Typography

- Base font size 20px; body line-height 1.5.
- Headings: h1 40px, h2 32px, h3 24px.
- Result screen headline ("CALL 911 NOW"): ≥ 48px, bold.
- System font stack; no webfont required to render the 911 button.

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
