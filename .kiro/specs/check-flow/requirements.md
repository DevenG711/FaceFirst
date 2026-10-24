# Requirements: Check Flow

## Introduction

The check flow is the part of FaceFirst a caregiver actually walks through: home, face check, arm check, speech check, result, and the optional BE-FAST questions. It owns the camera, the MediaPipe vision pipeline (`src/lib/vision/`), the capture-quality gates that decide when a capture starts, the in-memory session (`src/lib/stores/session.ts`) and the spoken prompts (`src/lib/voice.ts`). It also covers the dev-only `/simulate` page and console harness (`src/lib/dev/`). It does not score anything itself: scores come from `.kiro/specs/metrics/`, and the outcome comes from `.kiro/specs/triage-engine/`. Speech scoring internals are out of scope.

Criteria tagged **[TEST: file]** are covered by that test file today. Untagged criteria are met by the code but have no automated test.

This spec was written from the implementation after the flow was built, to keep the spec set complete.

## Glossary

- **Capture**: one timed recording of the live `<video>` for the face or arm check. Face: 5 s. Arm: 10 s.
- **Fit gate**: the pre-capture wait in `waitForFit`. The capture timer does not start until the gate resolves.
- **Fit hint**: a `FitHint` value (`face`, `smile`, `shoulders`, `wrists`) naming what the person still needs to do. Shown as `check.coach.<kind>.<hint>`.
- **Main flow**: face (step 1) → arm (step 2) → speech (step 3) → `/result`. BE-FAST is not a step in the main flow.
- **Session**: the Svelte stores in `session.ts`. In memory only. Lost on reload.
- **Clip / scenario**: a seeded, synthetic sequence of MediaPipe-shaped results from `src/lib/dev/scenarios.ts`.

## Requirement 1: Flow order and navigation

1. THE SYSTEM SHALL start the main flow from the home screen with a Start link to `/check/face` that is always enabled.
2. THE SYSTEM SHALL ask "When did the symptoms start?" on the home screen as an optional question, and SHALL NOT require an answer to start.
3. WHEN the person picks a symptom-onset option THE SYSTEM SHALL store the choice and the time it was picked (`SymptomOnsetRecord.recordedAt`).
4. THE SYSTEM SHALL route face → `/check/arm`, arm → `/check/speech`, speech → `/result`, with Back links in the reverse order.
5. THE SYSTEM SHALL show a step indicator (`FlowProgress`, "step n of 3") on the face, arm and speech screens.
6. THE SYSTEM SHALL offer the BE-FAST questions only from the amber `CANNOT_RULE_OUT` result screen, and every exit from `/check/befast` (last answer or Skip) SHALL go to `/result`.
7. WHEN the person presses Skip on a camera check THE SYSTEM SHALL record that check as `unavailable` and go to the next route.
8. WHEN a camera check completes THE SYSTEM SHALL store the measured `CheckResult`, show a neutral "check complete" line, and go to the next route after about 1 s.

## Requirement 2: Camera and display

1. THE SYSTEM SHALL request the front camera only after the person presses Start on a check, with `audio: false`.
2. THE SYSTEM SHALL request a wide frame (ideal 1280 × 720) for the arm check and the default frame for the face check.
3. THE SYSTEM SHALL mirror the preview with CSS only, and SHALL pass the unflipped `<video>` to MediaPipe.
4. THE SYSTEM SHALL draw a framing guide over the live video: an oval for the face, a head, shoulders and outstretched arms for the arm check. Before the video is live it SHALL show a static placeholder drawing (`FaceGuide` for the face).
5. WHEN camera permission is denied or `getUserMedia` is missing THE SYSTEM SHALL show a text message in place of the video and keep the Skip and Back controls available.
6. WHEN the capture ends or the person leaves the screen THE SYSTEM SHALL stop every camera track.
7. THE SYSTEM SHALL show a progress bar and a seconds-left count during the capture, in the accent color, never green.

## Requirement 3: Vision pipeline (`src/lib/vision/`)

1. THE SYSTEM SHALL create `FaceLandmarker` and `PoseLandmarker` (lite) in `VIDEO` mode for one face or one pose, with face blendshapes on, the first time each is needed, and reuse them after that.
2. THE SYSTEM SHALL load the MediaPipe WASM runtime from the app's own origin (`/mediapipe/wasm`) and the `.task` models from Google's public model store.
3. THE SYSTEM SHALL run detection once per animation frame, skip frames where `video.currentTime` has not changed, and pass a strictly increasing timestamp to `detectForVideo`.
4. WHEN one frame throws during detection THE SYSTEM SHALL drop that frame and keep the capture running.
5. WHEN the video has no size, a model fails to load, or detection fails as a whole THE SYSTEM SHALL return an `unavailable` result for that check and SHALL NOT throw.
6. THE SYSTEM SHALL map face landmarks 33, 263, 61, 291 to `eye33`, `eye263`, `mouth61`, `mouth291`, and pose landmarks 11, 12, 15, 16 to `shoulder11`, `shoulder12`, `wrist15`, `wrist16`. **[TEST: tests/vision-mapping.test.ts]**
7. THE SYSTEM SHALL convert every mapped point to pixels (`x · videoWidth`, `y · videoHeight`) and keep pose `visibility`. **[TEST: tests/vision-mapping.test.ts]**
8. WHEN no face or no pose is detected in a frame THE SYSTEM SHALL map that frame to `null`. **[TEST: tests/vision-mapping.test.ts]**
9. WHEN a single pose landmark is missing THE SYSTEM SHALL map that field to `null` so the metric skips it.
10. THE SYSTEM SHALL call `faceAsymmetry` and `armDrift` with `{ mirrored: false }`, so sides come back anatomical.
11. FOR a whole synthetic clip, the mapped frames run through the real metric and `triage()` SHALL give the documented verdict: droop or drift past threshold → `CALL_911_NOW` with opposite sides for opposite clips; too few usable frames, split readings, or frames bunched at the start → `RETRY_CAPTURE`. **[TEST: tests/pipeline.fixture.test.ts]**

## Requirement 4: Capture-quality gates

1. WHILE the gate is waiting THE SYSTEM SHALL show the live video and the current fit hint, and SHALL update the hint only when it changes.
2. THE SYSTEM SHALL start the arm capture only after `QUALITY.ARM_FIT_FRAMES` consecutive frames show both shoulders and both wrists usable. The arm gate has no time limit.
3. THE SYSTEM SHALL start the face capture only after `QUALITY.FACE_SMILE_FRAMES` consecutive frames show a usable face whose stronger-side `mouthSmile` blendshape is at least `QUALITY.FACE_SMILE_START`.
4. THE SYSTEM SHALL decide each gate frame with the same usability test the metric uses (`faceFit`, `armFit`). A one-sided smile SHALL count, and a frame the metric cannot use SHALL never count. **[TEST: tests/metricChecks.property.test.ts]**
5. WHEN the face gate is not met within `QUALITY.FACE_SMILE_WAIT_MS` THE SYSTEM SHALL start the capture anyway and keep asking for the smile, so a person who cannot smile is still measured.
6. WHEN the gate cannot load its model THE SYSTEM SHALL record the check as `unavailable` and finish the step.
7. WHEN the person skips or leaves during the gate THE SYSTEM SHALL stop waiting without recording a measurement.
8. THE SYSTEM SHALL read every gate number from `src/lib/triage/thresholds.ts`.

## Requirement 5: Session state (`session.ts`)

1. THE SYSTEM SHALL keep checks, BE-FAST answers, caregiver reports, symptom onset and locale in memory only, and SHALL NOT save or send them.
2. THE SYSTEM SHALL start every check as `unavailable` (`unavailableCheck`), so a check that never ran can only be read as "not checked".
3. `setCheck` SHALL replace the stored result for `result.id` and leave the other checks unchanged.
4. THE SYSTEM SHALL ask the BE-FAST questions in the order `balance`, `vision`, `headache`, `numbness`, and SHALL store "Not sure" as `unsure`.
5. `setCaregiverReport` SHALL add a report at most once when observed and remove it when not.

## Requirement 6: Voice prompts (`voice.ts`)

1. THE SYSTEM SHALL speak prompts with `speechSynthesis` in the active locale (`en-US`, `es-US`, `pt-BR`), cancelling anything already being spoken.
2. WHEN `speechSynthesis` is missing THE SYSTEM SHALL do nothing, and every spoken prompt SHALL also be shown as text.
3. THE SYSTEM SHALL speak the welcome on home (again on language change), the check instructions on load and on Start, the coaching line when the gate resolves, each BE-FAST question, and the result headline.

## Requirement 7: Result screen

1. THE SYSTEM SHALL build `TriageInput` from the session (with `baseline: null`), call `triage()` and render `resultCopy()`.
2. WHEN the state is `CALL_911_NOW` THE SYSTEM SHALL show a large red `tel:911` button.
3. WHEN the state is `RETRY_CAPTURE` THE SYSTEM SHALL show one retry link per check in `retryChecks`, plus a `tel:911` button.
4. WHEN the state is `CANNOT_RULE_OUT` THE SYSTEM SHALL show "check again", the optional BE-FAST questions, and a `tel:911` button.
5. THE SYSTEM SHALL show one row per check with a tag (`flagged`, `retry`, `notChecked`, `notFlagged`). Only `flagged` and `retry` use a status color; the others stay neutral.
6. THE SYSTEM SHALL show the symptom-onset answer and its clock time, or the time of the check if none was given.
7. THE SYSTEM SHALL announce the headline with `aria-live="assertive"`.

## Requirement 8: Safety in the flow

1. THE SYSTEM SHALL render `Call911Button` once in `+layout.svelte`, as the first element, in a sticky header on every route. No check screen, gate, camera error or dialog SHALL cover or disable it.
2. THE SYSTEM SHALL NOT show green or any reassuring message when a check completes or on the result screen.
3. THE SYSTEM SHALL treat skip, camera failure, model failure and poor capture as `unavailable` or `poor_quality`, which the engine can only make more cautious.
4. THE SYSTEM SHALL NOT send any frame, image, landmark or score off the device. Only the WASM runtime and model files are downloaded.
5. THE SYSTEM SHALL take every user-facing string in the product flow from `src/lib/i18n/*.json`.

## Requirement 9: Dev-only testing tools

1. THE SYSTEM SHALL install `window.facefirst` (`installTestHarness`) only when `import.meta.env.DEV` is true.
2. The harness SHALL let a developer set check results, replay a named clip through the real `mapFrames` and metrics, set BE-FAST answers and caregiver reports, switch locale, print the real `triage()` verdict, reset the session, and open `/result`.
3. WHEN `/simulate` is opened in a production build THE SYSTEM SHALL render nothing and redirect to `/`.
4. In dev, `/simulate` SHALL replay the face, arm and speech scenarios through the real metrics and show the live engine state and headline.
5. THE SYSTEM SHALL use one clip source (`src/lib/dev/scenarios.ts`) for both the harness and the fixture tests, through the re-export in `tests/fixtures/clips.ts`. **[TEST: tests/pipeline.fixture.test.ts]**
6. The dev tools SHALL only write inputs and read engine output. They SHALL NOT add a result state or touch the 911 control.
