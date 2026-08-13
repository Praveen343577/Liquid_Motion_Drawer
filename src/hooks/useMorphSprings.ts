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