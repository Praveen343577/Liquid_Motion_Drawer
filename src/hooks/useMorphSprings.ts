/**
 * useMorphSprings.ts
 *
 * Everything Framer-Motion-specific about the drawer's open/close
 * transition, extracted into one hook so DrawerSurface stays a thin
 * presentational component (blueprint: "Framer Motion variant extraction").
 *
 * Provides three things:
 *   1. `motionProps` — spread directly onto the surface's `motion.div`:
 *      the closed/open `variants` (blueprint D.3), the morph `transition`
 *      (blueprint D.2, stiffness 400 / damping 25), and `layout: true` so
 *      Framer's FLIP-based layout animation handles the borderRadius
 *      "50%" → 24 interpolation, which a plain keyframe tween can't do
 *      cleanly (blueprint E.2).
 *   2. `contentOpacity` — a MotionValue consumers bind to `children`'s
 *      opacity, gated so it only starts rising past
 *      CONTENT_REVEAL_THRESHOLD (blueprint E.3).
 *   3. `refractionBoost` — a MotionValue multiplier (1 at rest, up to
 *      MAX_REFRACTION_BOOST while the transition is moving fast) meant to
 *      multiply useLiquidMaps's unscaled `maximumDisplacement` before it's
 *      written to feDisplacementMap's `scale` attribute in
 *      LiquidFilterDefs.
 *
 * Design note on `refractionBoost` (documented in more detail in
 * LiquidConstants.ts next to the constants it uses): the vanilla demo
 * boosts refraction based on the lens's drag velocity in pixels. This
 * component doesn't have an equivalent pixel-drag signal at rest — instead
 * this hook derives velocity from the morph progress itself
 * (useVelocity), so the boost naturally spikes during the fast part of the
 * open/close spring and eases to 1 once it settles, with no extra prop or
 * gesture wiring required from the consumer. If DrawerSurface later adds a
 * drag-to-close gesture, that drag's own velocity will already flow
 * through `progress` (since dragging that gesture is what would drive
 * `isOpen`/a controlled progress value in the first place), so this same
 * mechanism covers it without changes here.
 */

import { useEffect } from "react";
import {
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
  type Transition,
  type Variants,
} from "framer-motion";
import {
  CLOSED_VARIANT,
  CONTENT_REVEAL_THRESHOLD,
  MAX_REFRACTION_BOOST,
  OPEN_VARIANT,
  REFRACTION_BOOST_VELOCITY_SCALE,
  SPRING_PRESETS,
} from "../config/liquidConstants";

export interface UseMorphSpringsOptions {
  /** Whether the drawer is currently open. Drives every value this hook returns. */
  isOpen: boolean;
  /**
   * Scales the peak refraction boost. 1 = the default feel, 0 disables the
   * boost entirely (displacement stays at its resting scale throughout the
   * transition), >1 exaggerates it. Defaults to 1.
   */
  boostIntensity?: number;
}

/** Ready-to-spread props for the surface's `motion.div`. */
export interface MorphMotionProps {
  variants: Variants;
  animate: "open" | "closed";
  transition: Transition;
  layout: true;
}

export interface MorphSprings {
  /** Spread directly onto `<motion.div {...motionProps}>`. */
  motionProps: MorphMotionProps;
  /** 0 (fully closed) → 1 (fully open), spring-eased. Exposed in case a consumer needs raw progress beyond contentOpacity/refractionBoost. */
  progress: MotionValue<number>;
  /** Bind to children's opacity — stays 0 until progress crosses CONTENT_REVEAL_THRESHOLD, then rises to 1. */
  contentOpacity: MotionValue<number>;
  /** Multiply useLiquidMaps's maximumDisplacement by this before writing feDisplacementMap's scale attribute. 1 at rest. */
  refractionBoost: MotionValue<number>;
}

export function useMorphSprings({
  isOpen,
  boostIntensity = 1,
}: UseMorphSpringsOptions): MorphSprings {
  // Source value: jumps immediately to the new target (0 or 1) whenever
  // isOpen flips. useSpring below is what actually smooths the motion —
  // this is just "where the spring is chasing."
  const openTarget = useMotionValue(isOpen ? 1 : 0);
  useEffect(() => {
    openTarget.set(isOpen ? 1 : 0);
  }, [isOpen, openTarget]);

  const progress = useSpring(openTarget, SPRING_PRESETS.morph);

  const progressVelocity = useVelocity(progress);
  const rawBoost = useTransform(progressVelocity, (velocity) => {
    if (boostIntensity <= 0) return 1;
    const magnitude = Math.min(
      Math.abs(velocity) * REFRACTION_BOOST_VELOCITY_SCALE,
      MAX_REFRACTION_BOOST - 1,
    );
    return 1 + magnitude * boostIntensity;
  });
  const refractionBoost = useSpring(rawBoost, SPRING_PRESETS.refractionBoost);

  const contentOpacity = useTransform(
    progress,
    [CONTENT_REVEAL_THRESHOLD, 1],
    [0, 1],
    { clamp: true },
  );

  const variants: Variants = { closed: CLOSED_VARIANT, open: OPEN_VARIANT };

  return {
    motionProps: {
      variants,
      animate: isOpen ? "open" : "closed",
      transition: SPRING_PRESETS.morph,
      layout: true,
    },
    progress,
    contentOpacity,
    refractionBoost,
  };
}