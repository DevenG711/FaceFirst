// Properties of lib/metrics. geometry.ts first; faceAsymmetry / armDrift / speech follow.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  anatomicalSideOfA,
  anatomicalSideOfB,
  faceFrame,
  poseFrame,
  flipSide,
  frameFrom,
  normalizePoint,
  normalizePoints,
  rollAngle,
  toAnatomical,
  type Point,
} from '#lib/metrics/geometry.ts';

const RUNS = { numRuns: 1000 };
const EPS = 1e-6;

const coord = fc.double({ min: -2000, max: 2000, noNaN: true, noDefaultInfinity: true });
const arbPoint: fc.Arbitrary<Point> = fc.record({ x: coord, y: coord });
/** Two reference points at least 1 unit apart, so the frame is well-conditioned. */
const arbPair = fc
  .tuple(arbPoint, arbPoint)
  .filter(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) >= 1);
const arbAngle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });
const arbScale = fc.double({ min: 0.01, max: 100, noNaN: true });
const arbSide = fc.constantFrom('left' as const, 'right' as const);

const close = (a: number, b: number, tol = EPS) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

/** Uniform similarity transform: scale by s, rotate by θ, translate by t. */
function similar(p: Point, s: number, theta: number, t: Point): Point {
  const c = Math.cos(theta);
  const n = Math.sin(theta);
  return { x: s * (p.x * c - p.y * n) + t.x, y: s * (p.x * n + p.y * c) + t.y };
}

describe('geometry: derotation', () => {
  it('derotating by the roll angle makes the eye line horizontal with unit length', () => {
    fc.assert(
      fc.property(arbPair, ([a, b]) => {
        const f = faceFrame(a, b)!;
        const na = normalizePoint(a, f);
        const nb = normalizePoint(b, f);
        close(na.y, 0);
        close(nb.y, 0);
        close(na.x, -0.5);
        close(nb.x, 0.5);
        // The roll angle of the normalized eye line is zero.
        close(rollAngle(na, nb), 0);
      }),
      RUNS
    );
  });
});

describe('geometry: invariance', () => {
  it('uniform scaling (and translation, rotation) of all points leaves normalized values unchanged', () => {
    fc.assert(
      fc.property(
        arbPair,
        fc.array(arbPoint, { minLength: 1, maxLength: 8 }),
        arbScale,
        arbAngle,
        arbPoint,
        ([a, b], pts, s, theta, t) => {
          const before = normalizePoints(pts, frameFrom(a, b)!);
          const move = (p: Point) => similar(p, s, theta, t);
          const after = normalizePoints(pts.map(move), frameFrom(move(a), move(b))!);
          // Points can lie up to ~4000 units from a 1-unit frame, so allow for float error.
          const tol = 1e-6 * (1 + Math.max(...before.map((p) => Math.abs(p.x) + Math.abs(p.y))));
          before.forEach((p, i) => {
            close(after[i]!.x, p.x, tol);
            close(after[i]!.y, p.y, tol);
          });
        }
      ),
      RUNS
    );
  });

  it('normalizePoints reuses the caller-supplied buffer', () => {
    const f = frameFrom({ x: 0, y: 0 }, { x: 2, y: 0 })!;
    const buf: Point[] = [{ x: 9, y: 9 }];
    const first = buf[0];
    const out = normalizePoints([{ x: 1, y: 0 }, { x: 2, y: 0 }], f, buf);
    expect(out).toBe(buf);
    expect(out[0]).toBe(first);
    expect(out).toEqual([{ x: 0, y: 0 }, { x: 0.5, y: 0 }]);
    normalizePoints([{ x: 1, y: 0 }], f, buf);
    expect(buf.length).toBe(1);
  });

  it('a degenerate frame (coincident or non-finite points) is rejected, not divided by zero', () => {
    fc.assert(
      fc.property(arbPoint, (p) => {
        expect(frameFrom(p, { ...p })).toBeNull();
      }),
      RUNS
    );
    expect(frameFrom({ x: Number.NaN, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(frameFrom({ x: 0, y: 0 }, { x: Infinity, y: 0 })).toBeNull();
  });
});

describe('geometry: mirror → anatomical side', () => {
  it('toAnatomical applied twice in the same mode returns the original side (involution)', () => {
    fc.assert(
      fc.property(arbSide, fc.boolean(), (side, mirrored) => {
        expect(toAnatomical(toAnatomical(side, mirrored), mirrored)).toBe(side);
      }),
      RUNS
    );
  });

  it('flipping `mirrored` flips the anatomical side, so undoing the flip returns the original', () => {
    fc.assert(
      fc.property(arbSide, fc.boolean(), (side, mirrored) => {
        expect(toAnatomical(side, !mirrored)).toBe(flipSide(toAnatomical(side, mirrored)));
        expect(flipSide(toAnatomical(toAnatomical(side, mirrored), !mirrored))).toBe(side);
      }),
      RUNS
    );
  });

  it('raw camera: landmark 33 (image-left) is the person’s right; mirrored: their left', () => {
    expect(anatomicalSideOfA(false)).toBe('right');
    expect(anatomicalSideOfA(true)).toBe('left');
    expect(anatomicalSideOfB(false)).toBe('left');
    expect(anatomicalSideOfB(true)).toBe('right');
  });
});

describe('geometry: pose frame orientation', () => {
  it('an upright person (11 on image-right) gives zero roll, and a wrist below the shoulders has y > 0', () => {
    // Image coordinates, y down. MediaPipe 12 (right shoulder) appears on image-left.
    const s12 = { x: 200, y: 300 };
    const s11 = { x: 400, y: 300 };
    const f = poseFrame(s11, s12)!;
    close(f.angle, 0);
    const wrist = normalizePoint({ x: 420, y: 400 }, f);
    expect(wrist.y).toBeGreaterThan(0);
    close(wrist.y, 0.5);
  });
});
