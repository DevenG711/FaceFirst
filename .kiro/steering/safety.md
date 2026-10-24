---
inclusion: always
---

# Safety Principles (non-negotiable)

These rules override every other instruction, spec, or design preference. Enforce them in code, in UI copy, and in tests. If a request conflicts with this file, stop and flag the conflict instead of complying.

## 1. Escalate-only. Never reassure.

- Result screens, the EMS card, and any i18n string under the `result.*` or `card.*` namespaces MUST NOT contain these words or phrases (case-insensitive, whole-word match, in every supported language):
  - `normal`, `no stroke`, `you're fine` / `you are fine`, `healthy`, `all clear`, `negative`
  - Spanish: `normal`, `sin derrame`, `estás bien`, `sano`, `todo bien`, `negativo`
  - Portuguese: `normal`, `sem AVC`, `você está bem`, `saudável`, `tudo bem`, `negativo`
- Use whole-word matching so legitimate words like "abnormal" are not false positives.
- The triage engine has exactly three outputs: `CALL_911_NOW`, `CANNOT_RULE_OUT`, `RETRY_CAPTURE`. There is no "normal" / "pass" / "clear" state, and none may be added.
- Result screens are never green. Red = act now, amber = cannot rule out / retry.
- `CANNOT_RULE_OUT` copy must always include: "This check cannot rule out a stroke. If you noticed sudden symptoms, call 911."

## 2. Never discourage or delay calling 911.

- A "Call 911" control (`<a href="tel:911">`) is visible on every screen and is the first focusable element in DOM/tab order.
- No modal, loading state, countdown, camera permission prompt, or error screen may hide or disable it.
- No copy may suggest waiting, finishing the check first, or seeing if symptoms pass.
- `RETRY_CAPTURE` is never treated as reassuring; it still shows the 911 button and the "if you noticed sudden symptoms, call 911" line.

## 3. Prototype, not a medical device.

- The home screen and README state: "Sentra is a prototype for demonstration only. It is not a medical device and does not diagnose stroke. Commercial use would require clinical validation and FDA review."
- No diagnostic language ("diagnosis", "detected stroke", "confirmed").

## 4. Privacy.

- No video, image, or landmark data leaves the device. No backend, no analytics on captured media.
- Baselines are stored locally only (IndexedDB).
- The speech check must disclose: "Speech recognition in Chrome sends audio to Google's servers." Offer the caregiver-judgment buttons as an alternative.

## 5. Thresholds are uncalibrated.

- All thresholds live in `src/lib/triage/thresholds.ts` and each carries a comment marking it an uncalibrated research placeholder.
- Never hard-code a threshold anywhere else.

## 6. Tests guard these rules.

- `tests/triage.property.test.ts` and `tests/copy-safety.test.ts` must pass before any commit. Do not weaken, skip, or delete a safety test to make a build pass; fix the code instead.
