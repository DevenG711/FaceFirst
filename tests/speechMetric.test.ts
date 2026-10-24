import { describe, expect, it } from 'vitest';
import { speechErrorScore } from '#lib/metrics/speech.ts';

describe('speechErrorScore', () => {
  it('is 0 when every word is heard, ignoring case and punctuation', () => {
    expect(speechErrorScore('The sky is blue today.', 'the sky is blue today')).toBe(0);
  });

  it('is the share of expected words that were missed', () => {
    expect(speechErrorScore('The sky is blue today.', 'the sky blue')).toBeCloseTo(0.4);
  });

  it('is 1 when nothing was heard', () => {
    expect(speechErrorScore('The sky is blue today.', '')).toBe(1);
  });

  it('counts a repeated word only as often as it was heard', () => {
    expect(speechErrorScore('a a b', 'a b')).toBeCloseTo(1 / 3);
  });

  it('matches accented words', () => {
    expect(speechErrorScore('El cielo está azul hoy.', 'el cielo esta azul hoy')).toBeCloseTo(0.2);
    expect(speechErrorScore('O céu está azul hoje.', 'o céu está azul hoje')).toBe(0);
  });
});
