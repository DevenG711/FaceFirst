# Partner 2: Copy Track

**Tool:** Claude Opus 5.5 (VS Code extension)
**Budget:** 0 Kiro credits — all work done through Claude Opus
**Spec:** `.kiro/specs/triage-engine/tasks.md` — you own Tasks 5, 6, and the copy half of 7

---

## Context to provide Claude Opus

Before each prompt, make sure Claude Opus can read these files from the repo. Open them or reference them with `#File`:

- `.kiro/specs/triage-engine/design.md` — types, copy table, copy.ts interface
- `.kiro/steering/safety.md` — banned word lists, copy-safety rules
- `src/lib/triage/bannedWords.json` — single source of truth for banned words
- `scripts/safety-lint.mjs` — matching semantics to replicate in bannedWords.ts

---

## Step 1 — Claude Opus prompt: bannedWords.ts (Task 5.1)

```
Read src/lib/triage/bannedWords.json and scripts/safety-lint.mjs from this repo.

Create src/lib/triage/bannedWords.ts that:
- Imports the bannedWords.json file
- Exports findBannedWords(text: string, locale: 'en' | 'es' | 'pt'): { word: string; index: number }[]
- Uses Unicode-aware whole-word matching (the 'u' flag) with case-insensitive matching ('i' flag)
- Normalizes curly apostrophes (U+2019, U+2018) to straight apostrophe before matching, so "You're fine" with a curly apostrophe is still caught
- Returns an empty array if no banned words found

The matching semantics must be identical to scripts/safety-lint.mjs in this repo. Do not add dependencies — pure TypeScript only.
```

---

## Step 2 — Claude Opus prompt: i18n files (Task 5.2)

```
Read .kiro/specs/triage-engine/design.md (the Copy section with the copy table) and .kiro/steering/safety.md (the banned word lists per locale).

Create three i18n files under src/lib/i18n/:

1. en.json — English copy for all three triage states (CALL_911_NOW, CANNOT_RULE_OUT, RETRY_CAPTURE) plus the "Re-check in 5 minutes" action. Use dot-namespaced keys under result.* (e.g., result.call911.title, result.call911.body, result.cannotRuleOut.title, result.cannotRuleOut.body, result.cannotRuleOut.recheck, result.retry.title, result.retry.body).

2. es.json — Spanish translations of every key in en.json. Same keys, Spanish values.

3. pt.json — Portuguese translations of every key in en.json. Same keys, Portuguese values.

Critical safety rules (from safety.md):
- None of the banned words may appear in any locale's copy (whole-word, case-insensitive match)
- CANNOT_RULE_OUT body must include the localized equivalent of: "This check cannot rule out a stroke. If you noticed sudden symptoms, call 911."
- RETRY_CAPTURE body must include the localized equivalent of: "If you noticed sudden symptoms, call 911."
- No green/normal/reassuring language anywhere

After creating the files, run findBannedWords from bannedWords.ts against each file's values to verify none contain banned words.
```

---

## Step 3 — Claude Opus prompt: copy.ts (Task 5.3)

**Note:** This needs the `TriageResult` type from Partner 1's `types.ts`. The full type definition is in `design.md`, so you can write against it now. If `types.ts` already exists, Claude Opus will pick it up automatically.

```
Read .kiro/specs/triage-engine/design.md (the Types and Copy sections).

Create src/lib/triage/copy.ts with:

- A function resultCopy(result: TriageResult, locale: 'en' | 'es' | 'pt') that returns { titleKey: string, bodyKeys: string[], actionKeys: string[] }
- Map each TriageState to the right i18n keys:
  - CALL_911_NOW → result.call911.title + body, colorToken is 'act'
  - CANNOT_RULE_OUT → result.cannotRuleOut.title + body + result.cannotRuleOut.recheck action, colorToken is 'caution'
  - RETRY_CAPTURE → result.retry.title + body, colorToken is 'caution'
- Import TriageResult from src/lib/triage/types.ts
- Load the locale JSON file and resolve keys to actual strings
- No DOM access, no Svelte, pure TypeScript only

Import types from ./types.ts. If that file doesn't exist yet, write the import against the interface in design.md — it will resolve once Partner 1 commits types.ts.
```

---

## Step 4 — Claude Opus prompt: copy-safety tests (Task 6)

**Blocker:** C1 needs `arbTriageInput` from Partner 1's `tests/arbitraries.ts`. Wait for Partner 1 to confirm it's committed before running C1. You can write all four tests now — they'll pass once the merge happens.

```
Read .kiro/specs/triage-engine/design.md (the Copy safety testing strategy), .kiro/steering/safety.md, and src/lib/triage/bannedWords.ts.

Create tests/copy-safety.test.ts with these four tests:

C1 [property-based, 1000 runs]: For a random TriageInput (use arbTriageInput from tests/arbitraries.ts) × each locale (en, es, pt), run triage() then resultCopy(), resolve all strings, and assert findBannedWords() returns an empty array for every resolved string.

C2 [property-based, 1000 runs]: For inputs that produce CANNOT_RULE_OUT and RETRY_CAPTURE, assert the resolved copy contains the localized "call 911" line (check for "911" in the body text).

C3 [example test]: Scan every string value under result.* in all three i18n JSON files with findBannedWords — none should match. Also assert every key in en.json exists in es.json and pt.json.

C4 [example test]: Assert findBannedWords catches "You're fine" (with a straight apostrophe) and "You're fine" (with curly apostrophe U+2019), but does NOT match "abnormal" (since "normal" must be whole-word only).

Import triage from src/lib/triage/engine.ts, resultCopy from src/lib/triage/copy.ts, findBannedWords from src/lib/triage/bannedWords.ts, and arbTriageInput from tests/arbitraries.ts. If engine.ts or arbitraries.ts don't exist yet (Partner 1 is still working), write the imports anyway — they'll resolve at merge time.
```

---

## Step 5 — Checkpoint (after merge with Partner 1)

Once Partner 1 has committed `types.ts`, `engine.ts`, and `arbitraries.ts`, run the full test suite:

```powershell
npx vitest --run
```

If all tests pass (both the engine property tests and your copy-safety tests), append an entry to `docs/KIRO_LOG.md` noting the copy track is complete and all tests are green.

If copy-safety tests fail, the issue is likely in your i18n copy or copy.ts — fix with Claude Opus, not Kiro. Only involve Kiro if there's a type mismatch at the merge boundary.
