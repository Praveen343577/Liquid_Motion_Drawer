import type { SurfaceType } from "../config/liquidConstants";

/** A bezel profile function: normalized position → normalized height. */
export type SurfaceEquationFn = (x: number) => number;

export const SurfaceEquations: Record<SurfaceType, SurfaceEquationFn> = {
  /** Quarter-circle profile — the sharpest, most traditional "glass edge" look. */
  convex_circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),

  /** Squircle (superellipse) profile — softer shoulder than a true circle. */
  convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),

  /** Inverted circle — bezel dips down before rising, a "scooped" look. */
  concave: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),

  /**
   * Blend of a fast convex rise near the rim and a concave settle toward
   * the interior, cross-faded with a smootherstep — produces the pronounced
   * "lip" highlight seen on the demo's lens edge.
   */
  lip: (x) => {
    const convex = Math.pow(1 - Math.pow(1 - Math.min(x * 2, 1), 4), 1 / 4);
    const concave = 1 - Math.sqrt(1 - Math.pow(1 - x, 2)) + 0.1;
    const smootherstep =
      6 * Math.pow(x, 5) - 15 * Math.pow(x, 4) + 10 * Math.pow(x, 3);
    return convex * (1 - smootherstep) + concave * smootherstep;
  },
};

/**
 * Look up a bezel profile function by its SurfaceType key. Small wrapper so
 * callers (useLiquidMaps) don't index into SurfaceEquations directly and
 * risk a typo'd string key slipping past the type checker.
 */
export function getSurfaceEquation(surfaceType: SurfaceType): SurfaceEquationFn {
  return SurfaceEquations[surfaceType];
}