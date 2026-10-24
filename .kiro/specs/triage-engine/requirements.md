# Requirements: Triage Engine

## Introduction

The triage engine is the safety-critical core of FaceFirst. It takes the results of the face, arm, and speech checks, the BE-FAST answers, caregiver observations, and an optional personal baseline, and returns exactly one of three escalate-only states: `CALL_911_NOW`, `CANNOT_RULE_OUT`, or `RETRY_CAPTURE`. It is a pure TypeScript module (`src/lib/triage/`) with no DOM access, and every safety rule below is verified with fast-check property-based tests.

Requirements tagged **[PBT]** must be covered by a property-based test in `tests/triage.property.test.ts` or `tests/copy-safety.test.ts`.

## Glossary

- **Check**: one of `face`, `arm`, `speech`.
- **Check status**: `ok` (scored), `poor_quality` (capture failed the quality gate), `unavailable` (could not be run, e.g. Web Speech API unsupported or user skipped).
- **Flagged**: a check with status `ok` whose score exceeds its threshold.
- **Finding**: any flagged check, any BE-FAST "yes", or any caregiver-reported abnormality.
- **Urgency order**: `CANNOT_RULE_OUT` (0) < `RETRY_CAPTURE` (1) < `CALL_911_NOW` (2).

## Requirement 1: Closed set of outputs

**User Story:** As a caregiver, I want the app to only ever push me toward action, so that it never talks me out of calling 911.

### Acceptance Criteria

1. THE SYSTEM SHALL return exactly one of `CALL_911_NOW`, `CANNOT_RULE_OUT`, `RETRY_CAPTURE` for every valid input. **[PBT]**
2. THE SYSTEM SHALL NOT produce any result labelled as normal, negative, clear, or equivalent. **[PBT]**
3. THE SYSTEM SHALL be total: for any input conforming to `TriageInput`, it SHALL return a result and SHALL NOT throw. **[PBT]**
4. THE SYSTEM SHALL be deterministic: the same input SHALL always produce the same output. **[PBT]**

## Requirement 2: Escalation on findings

**User Story:** As a caregiver, I want any warning sign to send me straight to "Call 911 now", so that I don't lose treatment time.

### Acceptance Criteria

1. WHEN any check is flagged THE SYSTEM SHALL return `CALL_911_NOW`. **[PBT]**
2. WHEN any BE-FAST answer is "yes" THE SYSTEM SHALL return `CALL_911_NOW`. **[PBT]**
3. WHEN the caregiver reports an abnormality (e.g. "Speech sounds slurred or wrong", "Face looks uneven") THE SYSTEM SHALL return `CALL_911_NOW` regardless of measured scores. **[PBT]**
4. WHEN `CALL_911_NOW` is returned THE SYSTEM SHALL list every reason that triggered it, including the affected anatomical side for flagged checks. **[PBT]**
5. WHEN no finding exists and every check has status `ok` or `unavailable` THE SYSTEM SHALL return `CANNOT_RULE_OUT`. **[PBT]**

## Requirement 3: Monotonicity

**User Story:** As a caregiver, I want more warning signs to always mean equal or higher urgency, so that the app is never inconsistent.

### Acceptance Criteria

1. WHEN any single finding is changed from absent to present THE SYSTEM SHALL return a result whose urgency is greater than or equal to the original. **[PBT]**
2. WHEN any check score is increased (all else equal) THE SYSTEM SHALL return a result whose urgency is greater than or equal to the original. **[PBT]**

## Requirement 4: Poor quality is never reassuring

**User Story:** As a caregiver, I want a bad camera capture to prompt a retry rather than a softer answer, so that bad lighting can't hide a stroke.

### Acceptance Criteria

1. WHEN any check has status `poor_quality` and no finding exists THE SYSTEM SHALL return `RETRY_CAPTURE`. **[PBT]**
2. WHEN any check has status `poor_quality` and a finding exists THE SYSTEM SHALL return `CALL_911_NOW`. **[PBT]**
3. WHEN any non-flagged check's status is changed from `ok` to `poor_quality` THE SYSTEM SHALL NOT return a less urgent result than before. **[PBT]** (A flagged score lost to a bad capture cannot be known to the engine; criterion 1 governs that case.)
4. WHEN `RETRY_CAPTURE` is returned THE SYSTEM SHALL identify which checks need to be retried.

## Requirement 5: Baseline comparison

**User Story:** As a family member, I want my parent's check compared to their own recorded baseline, so that the app is more sensitive to changes in their face.

### Acceptance Criteria

1. WHEN a baseline score exists for a check THE SYSTEM SHALL flag that check if the deviation (current − baseline) exceeds the baseline deviation threshold.
2. WHEN no baseline score exists for a check THE SYSTEM SHALL flag that check using the population threshold.
3. WHEN a baseline exists THE SYSTEM SHALL ALSO flag the check if the absolute score exceeds the population threshold, so that adding a baseline never lowers urgency. **[PBT]**
4. WHEN a baseline is used THE SYSTEM SHALL include the baseline comparison (baseline score, current score, deviation) in the result for the EMS card.

## Requirement 6: Thresholds

**User Story:** As a developer, I want all thresholds in one documented file, so that they can be tuned and are clearly marked as uncalibrated.

### Acceptance Criteria

1. THE SYSTEM SHALL read every numeric threshold from `src/lib/triage/thresholds.ts`.
2. THE SYSTEM SHALL document each threshold as an uncalibrated research placeholder.
3. THE SYSTEM SHALL NOT contain numeric threshold literals in `engine.ts`.

## Requirement 7: Result copy safety

**User Story:** As a caregiver under stress, I want every result screen to tell me clearly what to do and never imply I'm safe.

### Acceptance Criteria

1. FOR every possible triage output and every supported locale (en, es, pt) THE SYSTEM SHALL produce copy that contains none of the banned words in `safety.md` (whole-word, case-insensitive). **[PBT]**
2. WHEN `CANNOT_RULE_OUT` is returned THE SYSTEM SHALL include the copy "This check cannot rule out a stroke. If you noticed sudden symptoms, call 911." (localized). **[PBT]**
3. WHEN `CANNOT_RULE_OUT` is returned THE SYSTEM SHALL offer an untimed "run this check again" action that also says not to wait and to call 911. It SHALL NOT offer a timed re-check (e.g. "in 5 minutes"), because that suggests waiting (`safety.md` §2).
4. WHEN `RETRY_CAPTURE` is returned THE SYSTEM SHALL include the "If you noticed sudden symptoms, call 911" line. **[PBT]**
5. THE SYSTEM SHALL set `show911: true` on every triage result. **[PBT]**
6. THE SYSTEM SHALL map `CALL_911_NOW` to the `act` (red) color token and both other states to the `caution` (amber) color token, and SHALL NOT map any state to green. **[PBT]**
