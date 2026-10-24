# UI Build: Prompt Sequence

**Tool:** Claude Opus 5.5 (VS Code extension)
**Budget:** 0 Kiro credits for the build, 1 Kiro credit for optional safety verification at the end
**Goal:** Build the full FaceFirst web app UI — SvelteKit scaffold, all routes, components, and styling

---

## Context to provide Claude Opus before each prompt

Open these files in the editor or reference with `#File` so Claude Opus can read them:

- `.kiro/steering/design.md` — color tokens, typography, accessibility rules
- `.kiro/steering/safety.md` — 911 button rules, never green, banned words
- `.kiro/steering/product.md` — user flow, MVP scope, disclaimer text
- `.kiro/steering/structure.md` — route structure, layering rules
- `.kiro/steering/tech.md` — SvelteKit setup, coding rules
- `.kiro/specs/triage-engine/design.md` — TriageResult type (for result screen)

---

## Prompt 1 — SvelteKit scaffold, global styles, layout, Call911Button

This is the foundation. Everything else depends on it.

```
We're building a SvelteKit app (TypeScript strict mode, @sveltejs/adapter-static for Vercel). Read .kiro/steering/tech.md, .kiro/steering/design.md, .kiro/steering/structure.md, and .kiro/steering/safety.md from this repo.

Set up the project:

1. Initialize SvelteKit with TypeScript strict mode and adapter-static. If the project isn't scaffolded yet, run `npx sv create` with the minimal template and add @sveltejs/adapter-static.

2. Create src/app.css with CSS custom properties for the color tokens from design.md:
   --color-act: #C62828 (CALL_911_NOW, 911 button)
   --color-act-text: #FFFFFF
   --color-caution: #F9A825 (CANNOT_RULE_OUT, RETRY_CAPTURE)
   --color-caution-text: #1A1A1A
   --color-bg: #FFFFFF
   --color-fg: #111111
   --color-focus: #1565C0
   Base font size 20px, line-height 1.5. Headings: h1 40px, h2 32px, h3 24px.
   Focus styles: 3px solid var(--color-focus) with 2px offset. Never use outline:none without a replacement.
   Import app.css in the root layout.

3. Create src/lib/components/Call911Button.svelte:
   - A real <a href="tel:911"> with accessible name "Call 911"
   - Styled with var(--color-act) background, var(--color-act-text) text, bold, large (min 56px tall, full-width on mobile)
   - Must be the FIRST focusable element in DOM/tab order on every screen
   - aria-label="Call 911"

4. Create src/routes/+layout.svelte:
   - Renders Call911Button.svelte first (before any other content or nav)
   - Simple container layout, max-width for desktop, full-width on mobile
   - <svelte:head> with proper meta viewport for mobile
   - Sets <html lang="en"> (will be updated dynamically for locale)

5. Create a minimal src/routes/+page.svelte placeholder that says "FaceFirst" — we'll build the real home page next.

Safety rules to enforce (from safety.md):
- Never use green on any screen. No green "success" checkmarks.
- The 911 button must never be hidden, disabled, or behind a modal/overlay.
- Include the prototype disclaimer somewhere visible: "FaceFirst is a prototype for demonstration only. It is not a medical device and does not diagnose stroke."

After creating everything, run `npm run dev` briefly to confirm the app starts without errors, then stop the dev server.
```

---

## Prompt 2 — Home page

```
Read .kiro/steering/product.md (user flow, disclaimer), .kiro/steering/design.md (accessibility, language), and .kiro/steering/safety.md from this repo.

Build the home page at src/routes/+page.svelte. This is the entry point of the app.

The home page must include:

1. App title "FaceFirst" and a one-line description: "A 60-second stroke-warning check."

2. The prototype disclaimer (from safety.md section 3): "FaceFirst is a prototype for demonstration only. It is not a medical device and does not diagnose stroke. Commercial use would require clinical validation and FDA review."

3. A "When did symptoms start?" input — this captures the last-known-well timestamp. Use a simple datetime-local input or a "time ago" selector (e.g., "Just now", "Within the last hour", "1-3 hours ago", "More than 3 hours ago", "Not sure"). Store the value in a Svelte store so it's available on the result and EMS card screens.

4. A large "Start Check" button (full-width on mobile, min 56px tall) that navigates to /check/face.

5. A language switcher — flags or labels for English, Spanish, Portuguese. Store the selected locale in a Svelte store. This controls which i18n file is used throughout the app. Set the <html lang> attribute to the selected locale.

6. A secondary link/button to "Record a baseline" that navigates to /baseline.

7. Voice prompt on page load (speechSynthesis): a brief welcome message in the selected language.

Design rules (from design.md):
- Base font 20px, large tap targets (≥56×56px)
- Primary actions in the bottom half on mobile (one-handed use)
- Respect prefers-reduced-motion (no auto-animations)
- The Call911Button from +layout.svelte must remain visible and first in tab order above all of this content

All user-facing strings should use i18n keys (home.*) from src/lib/i18n/en.json. If those keys don't exist yet, add them. Keep strings at roughly grade 6 reading level.
```

---

## Prompt 3 — Camera view component + face check screen

```
Read .kiro/steering/product.md, .kiro/steering/design.md (camera views section), .kiro/steering/tech.md (MediaPipe section), and .kiro/steering/structure.md from this repo.

Create two things:

1. src/lib/components/CameraView.svelte — a reusable camera component:
   - Shows a live <video> feed from getUserMedia (front camera preferred on mobile)
   - Overlays a Canvas 2D framing guide (an oval/face outline for face check, a body outline for arm check)
   - Shows coaching text that can be set via a prop: "Move closer", "Face the camera", "More light", "Hold still"
   - Has a progress indicator (NOT green — use neutral gray or amber) showing check progress
   - Takes a prop for the framing guide type: 'face' | 'arm'
   - Emits an event when capture is complete
   - Requests camera permission gracefully; if denied, shows a fallback message with the 911 button still visible
   - The video is mirrored (selfie view) but any side reporting must convert to anatomical left/right
   - Do NOT integrate MediaPipe yet — just the camera UI shell. We'll wire in vision later.
   - The Call911Button must remain visible over the camera view (it's in +layout.svelte)

2. src/routes/check/face/+page.svelte — the face check screen:
   - Uses CameraView.svelte with type='face'
   - Shows on-screen instructions: "Look at the camera. We'll check for facial asymmetry."
   - Voice prompt (speechSynthesis) with the same instructions
   - A "Start face check" button that begins the camera
   - A progress indicator while the check runs (show 0-100% or a simple "Checking..." with a non-green spinner)
   - When done, stores the face check result in a Svelte store and navigates to /check/arm
   - "Skip this check" link that marks the check as 'unavailable' and moves to /check/arm

Safety: never show a green checkmark or "all clear" after the check. Use a neutral "Check complete" indicator. The 911 button stays visible throughout.

Add i18n keys under check.face.* in src/lib/i18n/en.json for all strings.
```

---

## Prompt 4 — Arm check + speech check screens

```
Read .kiro/steering/product.md (user flow), .kiro/steering/design.md, .kiro/steering/tech.md (speech section), and .kiro/steering/structure.md from this repo.

Create two check screens:

1. src/routes/check/arm/+page.svelte — the arm check screen:
   - Uses CameraView.svelte with type='arm'
   - Instructions: "Hold both arms out in front of you. We'll check for drift or weakness."
   - Voice prompt with the same instructions
   - Same flow as face check: start button, progress (non-green), store result, navigate to /check/speech
   - "Skip this check" link that marks as 'unavailable' and goes to /check/speech

2. src/routes/check/speech/+page.svelte — the speech check screen:
   - Shows a phrase to read aloud (e.g., "The sky is blue today") in the selected language
   - Uses the Web Speech API (SpeechRecognition or webkitSpeechRecognition) to capture speech
   - Shows a "Tap and speak" button that starts recording
   - Feature-detect SpeechRecognition; if unavailable, show caregiver judgment buttons instead:
     "Does the speech sound normal?" with options "Slurred or wrong" / "Sounds fine" / "Not sure"
     (Note: the "Sounds fine" button does NOT mean the check passed — it still goes through triage. It's a caregiver observation input, not a result.)
   - Disclosure text (from safety.md section 4): "Speech recognition in Chrome sends audio to Google's servers."
   - Offers the caregiver-judgment buttons as an alternative even when SpeechRecognition is available
   - Voice prompt reading the phrase aloud is NOT needed (the user is the one speaking)
   - Store result and navigate to the BE-FAST questions screen (a simple /check/befast route or a step within the flow)

Safety: no green indicators. The 911 button stays visible. Caregiver judgment buttons feed into the triage engine as caregiverReports, not as a pass/fail.

Add i18n keys under check.arm.* and check.speech.* in src/lib/i18n/en.json.
```

---

## Prompt 5 — BE-FAST questions screen

```
Read .kiro/steering/product.md (BE-FAST context), .kiro/specs/triage-engine/design.md (BeFastQuestion type, CaregiverReport type), and .kiro/steering/design.md from this repo.

Create src/routes/check/befast/+page.svelte — the BE-FAST questions screen:

This presents the four BE-FAST questions (balance, vision, headache, numbness) as a series of cards. For each question:

1. Show the question text:
   - Balance: "Have they had sudden trouble with balance or coordination?"
   - Vision: "Have they had sudden vision loss or changes in one or both eyes?"
   - Headache: "Have they had a sudden severe headache with no known cause?"
   - Numbness: "Have they had sudden numbness or weakness, especially on one side?"

2. Three answer buttons per question: "Yes", "No", "Not sure" (large tap targets, full-width on mobile)
   - "Yes" and "Not sure" are visually distinct from "No" but NOT green
   - "Not sure" is treated as 'unsure' (not 'yes') by the triage engine

3. A progress indicator showing which question you're on (1 of 4, 2 of 4, etc.) — neutral color, not green

4. After all four questions, store the answers in the Svelte store and navigate to /result

5. Voice prompt for each question (speechSynthesis reads the question aloud)

The answers map to the BeFastQuestion type: 'balance' | 'vision' | 'headache' | 'numbness', with Answer type: 'yes' | 'no' | 'unsure'.

Add i18n keys under check.befast.* in src/lib/i18n/en.json for all questions and button labels.
```

---

## Prompt 6 — Result screen

**Dependency note:** This screen wires into the triage engine (`triage()` from `src/lib/triage/engine.ts`) and copy resolution (`resultCopy()` from `src/lib/triage/copy.ts`). If Partner 1's engine isn't committed yet, build against the `TriageResult` interface in `design.md` and wire the import later.

```
Read .kiro/specs/triage-engine/design.md (TriageResult type, copy table, color tokens), .kiro/steering/design.md (result screen specs), and .kiro/steering/safety.md (escalate-only rules) from this repo.

Create src/routes/result/+page.svelte — the result screen:

This is the safety-critical screen. It takes all the check results, BE-FAST answers, and caregiver reports from the Svelte stores, calls triage() to get a TriageResult, then calls resultCopy(result, locale) to get the i18n strings, and displays them.

Display logic by state:

CALL_911_NOW:
- Background: var(--color-act) (#C62828 red)
- Headline: "CALL 911 NOW" at ≥48px bold, in var(--color-act-text) (white)
- Body: list every reason from result.reasons (e.g., "Face asymmetry detected — left side", "Balance: Yes", "Caregiver: Face looks uneven")
- Note the time symptoms started (from the home page store)
- The 911 button is already in +layout.svelte but make it EXTRA prominent here — large, pulsing (unless prefers-reduced-motion), center screen

CANNOT_RULE_OUT:
- Background: var(--color-caution) (#F9A825 amber)
- Headline: "We can't rule out a stroke"
- Body: "This check cannot rule out a stroke. If you noticed sudden symptoms, call 911."
- Action button: "Re-check in 5 minutes" that navigates back to the face check
- The 911 button remains visible and prominent

RETRY_CAPTURE:
- Background: var(--color-caution) (amber)
- Headline: "We couldn't get a clear reading"
- Body: "Please retry: [list of checks that need retry]. If you noticed sudden symptoms, call 911."
- Action button: "Retry [check name]" that navigates back to that check
- The 911 button remains visible

All states:
- Use aria-live="assertive" so screen readers announce the result immediately
- Never use the word "normal", "clear", "negative", "healthy", "you're fine", or any banned word from safety.md
- Never use green anywhere on this screen
- colorToken from TriageResult maps to the background color ('act' → red, 'caution' → amber)
- show911 is always true — the 911 button is always visible
- Display baseline comparisons if any exist (baseline score, current score, deviation) in a simple readable format

Import triage from src/lib/triage/engine.ts and resultCopy from src/lib/triage/copy.ts. If those files don't exist yet (still being built), import them anyway — they'll resolve at merge time. The TriageResult interface is fully defined in design.md.

Use the i18n result.* keys that should already exist in src/lib/i18n/en.json from the earlier copy track work.
```

---

## Prompt 7 — EMS card

```
Read .kiro/steering/product.md (EMS handoff card, last-known-well), .kiro/steering/design.md (accessibility), and .kiro/steering/safety.md from this repo.

Create src/routes/card/+page.svelte — the EMS handoff card:

This is a screen designed to be shown to paramedics when they arrive. It summarizes everything in a clean, scannable format:

1. Header: "EMS Handoff — FaceFirst" 
2. Last known well time: the timestamp captured on the home page (prominently displayed, large text)
3. Check results summary: which checks were run, their status, and any findings (face/arm/speech scores, flagged checks with anatomical side)
4. BE-FAST answers: the four answers (yes/no/unsure for each)
5. Caregiver observations: any reported abnormalities
6. Baseline comparison: if a baseline was used, show baseline vs current for each check
7. Triage state: CALL_911_NOW / CANNOT_RULE_OUT / RETRY_CAPTURE (displayed clearly)
8. A "Print" or "Share" button (if Web Share API is available; otherwise a print-friendly layout)

Design:
- High contrast, large text (paramedics may be reading quickly in poor lighting)
- No green anywhere
- The 911 button remains visible (though paramedics are likely already called by this point)
- Print-friendly: add @media print styles so the card prints cleanly without nav/buttons
- Time displayed prominently — "time is brain" is the whole point

Pull data from the same Svelte stores used by the result screen.

Add i18n keys under card.* in src/lib/i18n/en.json for all labels.
```

---

## Prompt 8 — Baseline enrollment flow

```
Read .kiro/steering/product.md (personal baseline differentiator), .kiro/steering/tech.md (IndexedDB, storage), .kiro/steering/design.md, and .kiro/steering/safety.md from this repo.

Create the baseline enrollment flow at src/routes/baseline/:

This is a separate flow from the main check. A caregiver records a 30-second healthy snapshot of their loved one for future comparison.

1. src/routes/baseline/+page.svelte — the enrollment landing:
   - Explanation: "Record a healthy baseline. We'll compare future checks against this to catch small changes in your loved one's face."
   - "Start baseline recording" button → navigates to /baseline/record
   - Note: "Baselines are stored on this device only. No video or data leaves your phone."

2. src/routes/baseline/record/+page.svelte — the recording screen:
   - Uses CameraView.svelte with type='face'
   - Instructions: "Have them look at the camera and smile naturally for 30 seconds."
   - Voice prompt with the same instructions
   - 30-second countdown timer (neutral color, not green)
   - Stores the resulting baseline scores to IndexedDB using idb-keyval
   - Keys: 'baseline_face', 'baseline_arm', 'baseline_speech' (store the numeric scores, NOT the video)
   - On completion: "Baseline saved" (neutral indicator, not green) with a button to return home

3. src/lib/storage/baselines.ts — the storage module:
   - get() and set() functions for baseline scores using idb-keyval
   - Pure data in/out, no Svelte, no DOM (per structure.md layering rules)

Safety: the baseline flow must never imply the person is "healthy" or "normal." It's a comparison reference, not a clean bill of health. The 911 button stays visible. No green anywhere.

Add i18n keys under baseline.* in src/lib/i18n/en.json.
```

---

## Prompt 9 — i18n completion + Spanish/Portuguese translations

```
Read all the i18n keys that have been added to src/lib/i18n/en.json across the UI build so far (home.*, check.*, result.*, card.*, baseline.*). Also read .kiro/steering/safety.md for the banned word lists in Spanish and Portuguese.

Create or update src/lib/i18n/es.json and src/lib/i18n/pt.json so that:
- Every key in en.json has a corresponding translation in es.json and pt.json
- Translations use plain language at roughly grade 6 reading level
- None of the banned words from safety.md appear in any translated string
- The call-911 messaging is preserved in all languages

After translating, run findBannedWords from src/lib/triage/bannedWords.ts against every string value in all three files to verify none contain banned words.
```

---

## Prompt 10 (optional, Kiro) — Safety verification

This is the one Kiro credit spend. After all UI is built and merged with Partner 1's engine:

```
Review the UI build against .kiro/steering/safety.md. Check every route and component for:
1. The 911 button (Call911Button.svelte) is the first focusable element on every screen and is never hidden or disabled
2. No green is used on any result screen, check completion indicator, or EMS card
3. No banned words from safety.md appear in any i18n string or rendered output
4. CANNOT_RULE_OUT copy includes "This check cannot rule out a stroke. If you noticed sudden symptoms, call 911."
5. RETRY_CAPTURE copy includes the "if you noticed sudden symptoms, call 911" line
6. The prototype disclaimer is present on the home screen
7. aria-live="assertive" is on the result screen
8. Focus styles are visible (never outline:none without replacement)
9. prefers-reduced-motion is respected (no pulsing/animation when set)

Fix any violations you find. Do not weaken or skip any safety check.
```

---

## Dependency summary

| Prompt | Depends on |
|--------|-----------|
| 1. Scaffold + layout | Nothing |
| 2. Home page | Prompt 1 |
| 3. Camera + face check | Prompt 1 |
| 4. Arm + speech check | Prompt 3 (CameraView component) |
| 5. BE-FAST | Prompt 1 |
| 6. Result screen | Prompts 2-5 (stores have data) + Partner 1's engine.ts + Partner 2's copy.ts |
| 7. EMS card | Prompts 2-6 (stores + triage result) |
| 8. Baseline | Prompt 1 (CameraView from Prompt 3) |
| 9. i18n completion | Prompts 2-8 (all keys exist) |
| 10. Safety check (Kiro) | Everything merged |

Prompts 1, 2, 3, 5, and 8 can be done in parallel by different people since they only depend on Prompt 1. Prompts 4 depends on 3 (CameraView). Prompts 6 and 7 are the merge point with the engine track.
