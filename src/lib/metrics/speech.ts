// Speech metric. Pure function: no DOM, no Svelte (.kiro/steering/structure.md).

const words = (s: string): string[] =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * 1 − word accuracy, in [0, 1]: the share of expected words missing from what was heard
 * (0 = every word heard). The triage engine compares it with POPULATION_THRESHOLD.speech.
 */
export function speechErrorScore(expected: string, heard: string): number {
  const want = words(expected);
  if (want.length === 0) return 0;

  const pool = new Map<string, number>();
  for (const w of words(heard)) pool.set(w, (pool.get(w) ?? 0) + 1);

  let matched = 0;
  for (const w of want) {
    const left = pool.get(w) ?? 0;
    if (left > 0) {
      matched++;
      pool.set(w, left - 1);
    }
  }
  return 1 - matched / want.length;
}
