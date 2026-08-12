/**
 * index.ts - Public API surface for LiquidMotionDrawer.
 *
 * Blueprint: "index.ts (Public API export)." This is the only file in the
 * component meant to be imported from outside this folder - everything
 * else (hooks/, core/) is an internal implementation detail, deliberately
 * not re-exported here. That's a real scope decision, not an oversight:
 *
 *   import { LiquidMotionDrawer } from "@/components/LiquidMotionDrawer";
 *
 * should be the only import path most consumers ever need.
 *
 * What's exported, and why:
 *
 *   - LiquidMotionDrawer (+ its props, + DrawerControls): the actual
 *     public entry point - portal, state management, focus handling, the
 *     click-to-open pill trigger. This is what "using the drawer" means
 *     for the overwhelming majority of consumers.
 *
 *   - DrawerSurface, DrawerOverlay, LiquidFilterDefs (+ their props):
 *     exported for advanced/headless composition - e.g. a consumer who
 *     wants a non-modal surface without the overlay's scrim/scroll-lock,
 *     or their own portal/state strategy instead of LiquidMotionDrawer's.
 *     Each already works standalone (none of them depend on
 *     LiquidMotionDrawer itself), so exposing them costs nothing and
 *     avoids forcing a fork for a legitimately different composition.
 *
 *   - LiquidOpticsConfig, SurfaceType, DEFAULT_LIQUID_OPTICS: re-exported
 *     from config specifically because `optics?: Partial<LiquidOpticsConfig>`
 *     is part of the public prop surface (on all four components above) -
 *     a consumer can't correctly type or spread-extend an `optics` object
 *     without these. This is the one place internals leak through, and
 *     it's deliberate: the alternative (consumers hand-writing an
 *     un-typed object literal, or reaching into
 *     "../../config/LiquidConstants" directly) is worse.
 *
 * What's deliberately NOT exported: useLiquidMaps, useMorphSprings, and
 * everything in core/ (surfaceEquations, liquidMath, imageRenderer), plus
 * the animation-timing constants (SPRING_PRESETS, CLOSED_VARIANT/
 * OPEN_VARIANT, CONTENT_REVEAL_THRESHOLD, DEFAULT_OVERLAY_BLUR,
 * DEFAULT_FALLBACK_BLUR). None of them are referenced by any exported
 * prop type, so there's no correctness reason to expose them - and a
 * smaller public surface is fewer things that become a breaking change to
 * later adjust. If a genuine headless use case shows up that needs
 * useMorphSprings or useLiquidMaps directly, that's a real, addressable
 * follow-up - not something to speculatively export now on the chance
 * it's wanted.
 *
 * Named exports only, no default export - consistent with every other
 * file in this component, and it keeps a consumer's import statement
 * self-documenting rather than depending on whatever name they choose for
 * a default import.
 */

export { LiquidMotionDrawer } from "./LiquidMotionDrawer";
export type { LiquidMotionDrawerProps, DrawerControls } from "./LiquidMotionDrawer";

export { DrawerSurface } from "./DrawerSurface";
export type { DrawerSurfaceProps } from "./DrawerSurface";

export { DrawerOverlay } from "./DrawerOverlay";
export type { DrawerOverlayProps } from "./DrawerOverlay";

export { LiquidFilterDefs } from "./LiquidFilterDefs";
export type { LiquidFilterDefsProps } from "./LiquidFilterDefs";

export { DEFAULT_LIQUID_OPTICS } from "../../config/liquidConstants";
export type { LiquidOpticsConfig, SurfaceType } from "../../config/liquidConstants";