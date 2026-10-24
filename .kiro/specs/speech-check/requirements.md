# Requirements: Speech Check

## Introduction

The speech check is the "S" in BE-FAST. The person reads one sentence out loud. The route (`src/routes/check/speech/+page.svelte`) records a transcript with the Web Speech API and an RMS amplitude envelope with a Web Audio `AnalyserNode`. It passes both as plain data to `speechScore()` in `src/lib/metrics/speech.ts`, which returns one `CheckResult` for the triage engine. The score is word error (from a longest common subsequence) plus uncalibrated acoustic proxies for slow, paused or flat speech. Acoustics can only raise the score. When the browser cannot listen, or nothing clear was heard, caregiver judgment buttons are shown as a fallback.

Shared metric rules (word normalization, LCS word error, status rules, `speechTiming`) are specified in `.kiro/specs/metrics/requirements.md` Requirement 4 and are referenced here, not repeated. How the engine turns a `CheckResult` or a caregiver report into a state is specified in `.kiro/specs/triage-engine/`.

Requirements tagged **[PBT]** are covered by fast-check properties in `tests/speechAcoustics.property.test.ts` or `tests/metricChecks.property.test.ts`. **[TEST: <file>]** marks example-based tests. Untagged criteria are implemented but have no automated test (the route has no component tests).

This spec was written from the implementation after the check was built, to keep the spec set complete.

## Glossary

- **Attempt**: one tap of "Tap and speak" until the attempt ends (button, timeout or error).
- **Target phrase**: `check.speech.phrase` in the active locale. English: "You can't teach an old dog new tricks."
- **Amplitude envelope**: RMS amplitude samples (0 to 1), one every `ACOUSTIC_PARAMS.SAMPLE_MS` ms, recorded during an attempt.
- **Voiced floor**: `max(QUALITY.SILENCE_LEVEL, ACOUSTIC_PARAMS.RELATIVE_SILENCE × loudest sample)`. A sample above it counts as voiced in the acoustic proxies (`voicedFloor()`).
- **Speech span**: the samples from the first voiced sample to the last voiced sample.
- **Word error**: `1 − LCS(transcript words, target words) / target words`, in [0, 1] (metrics Req 4).
- **Acoustic score**: weighted average of three sub-scores (rate, pause, envelope), in [0, 1]. Higher means more abnormal.
- **Caregiver fallback**: the three judgment buttons "Slurred or wrong", "No change I can hear", "Not sure".

## Requirement 1: Word scoring

1. THE SYSTEM SHALL score the transcript against the target phrase with `speechScore()` as specified in metrics Requirement 4.1 to 4.6. Test coverage is tagged there.
2. THE SYSTEM SHALL use the target phrase of the active locale (en, es, pt) as the target.
3. WHEN an attempt ends with no transcript at all THE SYSTEM SHALL score an empty string, so the result is `poor_quality` (retry) rather than `unavailable`.
4. WHEN most target words are missing THE SYSTEM SHALL produce a score above `POPULATION_THRESHOLD.speech`, which `triage()` turns into `CALL_911_NOW`. **[TEST: tests/metricChecks.property.test.ts]** **[TEST: tests/pipeline.fixture.test.ts]**

## Requirement 2: Acoustic proxies (`speechAcoustics`)

1. THE SYSTEM SHALL count a sample as voiced only above the voiced floor, so steady room hum below the floor does not change the result. **[PBT]** **[TEST: tests/speechMetric.test.ts]**
2. THE SYSTEM SHALL measure, over the speech span: target words per second, the share of the span spent in pauses of at least `QUALITY.MIN_PAUSE_MS`, the longest such pause, and the coefficient of variation of voiced amplitudes.
3. THE SYSTEM SHALL map each measure to a sub-score in [0, 1] with a linear ramp between its `ACOUSTIC_PARAMS` "ok" and "bad" bounds. The pause sub-score SHALL be the larger of the pause-share and longest-pause ramps.
4. THE SYSTEM SHALL return an acoustic score in [0, 1], or `null` when there is nothing to analyze. **[PBT]**
5. WHEN there is no voiced sample, `sampleMs` is not a positive finite number, or the target has no words THE SYSTEM SHALL return `null`, which adds no finding.
6. WHEN a hesitation of at least `QUALITY.MIN_PAUSE_MS` is inserted inside the speech span THE SYSTEM SHALL NOT return a lower acoustic score. **[PBT]**
7. WHEN the loudness of the voiced samples is flattened THE SYSTEM SHALL NOT return a lower acoustic score. **[PBT]**
8. WHEN the whole attempt is slowed down THE SYSTEM SHALL NOT return a lower acoustic score. **[PBT]**
9. WHEN a fluent, well-modulated attempt is analyzed THE SYSTEM SHALL return an acoustic score of 0. WHEN a slow, flat, over-paused attempt is analyzed THE SYSTEM SHALL return a higher speech score, even with every word right. **[TEST: tests/speechMetric.test.ts]**

## Requirement 3: Combined score (escalate-only)

1. THE SYSTEM SHALL combine scores as `combineSpeechScore(wordError, acoustic) = min(1, wordError + ACOUSTIC_PARAMS.ACOUSTIC_WEIGHT × max(0, acoustic))`. The result SHALL stay in [0, 1], never fall below the word error, and never fall when the acoustic score rises. **[PBT]**
2. WHEN an amplitude envelope is given THE SYSTEM SHALL return a speech score at least as high as the word-only score. **[PBT]** **[TEST: tests/speechMetric.test.ts]**
3. WHEN the whole attempt is slowed down THE SYSTEM SHALL NOT return a lower final speech score. **[PBT]**
4. WHEN an envelope is given without `speakingMs` THE SYSTEM SHALL derive speaking time with `speechTiming()`, and WHEN that is below `QUALITY.MIN_SPEECH_MS` THE SYSTEM SHALL return `poor_quality`. **[PBT]**
5. WHEN the transcript is `null` or `undefined` THE SYSTEM SHALL return `unavailable`, whatever the recording. **[PBT]**
6. WHEN the envelope is empty THE SYSTEM SHALL use the word error alone.
7. THE SYSTEM SHALL report `side: null` for speech.

## Requirement 4: Listening through pauses

1. WHEN the page mounts THE SYSTEM SHALL feature-detect `SpeechRecognition ?? webkitSpeechRecognition`, and WHEN neither exists THE SYSTEM SHALL enter the `unsupported` phase.
2. WHEN an attempt starts THE SYSTEM SHALL create a recognizer with `lang = VOICE_LANG[locale]` (`en-US`, `es-US`, `pt-BR`), `continuous: true`, `interimResults: true`, `maxAlternatives: 1`.
3. WHEN the browser ends recognition on its own during an attempt THE SYSTEM SHALL keep the words heard so far and restart recognition.
4. THE SYSTEM SHALL end an attempt only when the user taps "Done speaking", or WHEN no voice was heard for `LISTEN_PARAMS.START_TIMEOUT_MS`, or WHEN `LISTEN_PARAMS.END_SILENCE_MS` of silence follows voice, or WHEN `LISTEN_PARAMS.MAX_LISTEN_MS` has passed.
5. THE SYSTEM SHALL treat as voice any amplitude sample above the adaptive floor (using the loudest level so far) and any new recognition result.
6. WHEN recognition reports `not-allowed`, `service-not-allowed` or `audio-capture` THE SYSTEM SHALL enter the `micDenied` phase and record the speech check as `unavailable`.
7. WHEN recognition reports `network` or `language-not-supported` THE SYSTEM SHALL NOT restart, and SHALL score what was heard.
8. THE SYSTEM SHALL ignore events from an earlier attempt that is still shutting down.
9. WHEN the user leaves the page THE SYSTEM SHALL abort recognition, clear timers and release the microphone.

## Requirement 5: Audio capture (`AnalyserNode`)

1. WHEN the user taps to start THE SYSTEM SHALL create the `AudioContext` and call `resume()` before any `await`, so Chrome does not record silence.
2. THE SYSTEM SHALL read time-domain data from an `AnalyserNode` (`fftSize` 2048) every `ACOUSTIC_PARAMS.SAMPLE_MS` into one reused `Float32Array`, and append `rms()` of that frame to the envelope.
3. WHEN the microphone stream cannot be opened THE SYSTEM SHALL continue without an envelope, so the word score stands alone.
4. WHEN an attempt ends THE SYSTEM SHALL stop the media tracks, clear the sampling timer and close the `AudioContext`.
5. WHILE listening THE SYSTEM SHALL show wave bars from the recent levels relative to the loudest so far. The bars SHALL be hidden from assistive technology.

## Requirement 6: Caregiver fallback

1. THE SYSTEM SHALL show the caregiver buttons only in the `unsupported`, `micDenied`, `noSpeech` and `unclear` phases.
2. WHEN "Slurred or wrong" is chosen THE SYSTEM SHALL record the caregiver report `speech_wrong`. WHEN "No change I can hear" or "Not sure" is chosen THE SYSTEM SHALL remove that report. Neither choice SHALL lower any measured score.
3. THE SYSTEM SHALL mark the chosen button with `aria-pressed`.
4. WHEN an attempt is scored THE SYSTEM SHALL enter `heard` if the status is `ok`, otherwise `unclear` if any transcript exists, otherwise `noSpeech`.
5. WHEN in `noSpeech` or `unclear` THE SYSTEM SHALL let the user try again or go to the result.

## Requirement 7: Disclosure and privacy

1. WHEN the browser supports speech recognition THE SYSTEM SHALL show `check.speech.disclosure`: "Speech recognition in Chrome sends audio to Google's servers." (also in es and pt).
2. THE SYSTEM SHALL keep the amplitude envelope in memory only. The app SHALL NOT store or upload audio or the envelope.
3. THE SYSTEM SHALL show the tuning readout (measured values, raw samples, session mean and SD) only in dev builds (`import.meta.env.DEV`).

## Requirement 8: Voice prompts and copy

1. WHEN the page mounts THE SYSTEM SHALL speak `check.speech.instructions` in the active locale with `speak()`, which uses `speechSynthesis` and does nothing where it is unsupported.
2. WHEN an attempt starts THE SYSTEM SHALL cancel any spoken prompt.
3. THE SYSTEM SHALL show the same instructions and the target phrase on screen.
4. THE SYSTEM SHALL take all user-facing copy from `src/lib/i18n/*.json` (except the dev-only readout) and announce status changes in an `aria-live="polite"` region.

## Requirement 9: Thresholds

1. THE SYSTEM SHALL read every speech threshold, weight and limit from `src/lib/triage/thresholds.ts` (`QUALITY`, `ACOUSTIC_PARAMS`, `LISTEN_PARAMS`, `POPULATION_THRESHOLD.speech`), each marked as an uncalibrated placeholder.
