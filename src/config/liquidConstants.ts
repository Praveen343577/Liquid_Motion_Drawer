/**
 * LiquidConstants.ts
 *
 * Central source of truth for every tunable number the Liquid Motion Drawer
 * depends on. Values are ported 1:1 from the vanilla "Liquid Glass" demo
 * (the magnifying-lens element) so the drawer reproduces the same optical
 * behavior. Nothing in this file touches React — it's pure config/types,
 * consumed by core/, hooks/, and components/.
 */

/** The four bezel height-profile shapes supported by core/surfaceEquations.ts */
export type SurfaceType = "convex_circle" | "convex_squircle" | "concave" | "lip";

/** Physical/optical parameters that feed the displacement + specular map math. */
export interface LiquidOpticsConfig {
  /** Which bezel profile to use. */
  surfaceType: SurfaceType;
  /** How wide the refracting bezel band is, in px. */
  bezelWidth: number;
  /** Simulated glass thickness, in px — controls how "deep" the refraction reads. */
  glassThickness: number;
  /** Index of refraction used in the Snell's-law calculation (glass ≈ 1.5). */
  refractiveIndex: number;
  /** Multiplier applied on top of the computed max displacement. */
  refractionScale: number;
  /** Opacity (alpha slope) of the specular highlight layer, 0–1. */
  specularOpacity: number;
  /** Saturation boost applied to the refracted content behind the glass (feColorMatrix's `values`, applied to the *displaced* result — not the specular layer, despite the similarly-named specularOpacity above). */
  saturation: number;
  /** feGaussianBlur stdDeviation applied before displacement. */
  blur: number;
}

/**
 * Defaults matched to the demo's magnifying-lens `state` object
 * (see scripts.js: bezelWidth 30, glassThickness 150, refractiveIndex 1.5,
 * refractionScale 1.5, specularOpacity 1, blur 0.5).
 */
export const DEFAULT_LIQUID_OPTICS: LiquidOpticsConfig = {
  surfaceType: "convex_squircle",
  bezelWidth: 30,
  glassThickness: 150,
  refractiveIndex: 1.5,
  refractionScale: 1.5,
  specularOpacity: 1,
  saturation: 1.3,
  blur: 0.5,
};

/** Number of radial samples used when precomputing the 1D displacement profile. */
export const DISPLACEMENT_SAMPLES = 128;

/** Light angle (radians) used when rendering the specular highlight. Demo default: Math.PI / 3. */
export const SPECULAR_ANGLE = Math.PI / 3;

/** Thickness (px) of the specular highlight band along the bezel edge. */
export const SPECULAR_THICKNESS = 1.5;

// ---------------------------------------------------------------------------
// Spring physics presets (Framer Motion `transition` objects)
// ---------------------------------------------------------------------------

export interface SpringPreset {
  type: "spring";
  stiffness: number;
  damping: number;
}

/**
 * Named spring presets, ported from the demo's various `Spring` instances.
 * - `morph`      → the open/close layout transition (blueprint D.2: 400/25).
 * - `refractionBoost` → subtle extra "boost" to refraction strength while
 *   the drawer is actively animating, mirrors the lens's `refractionBoost`
 *   spring (300/18) which snaps up on drag-start and eases down at rest.
 * - `snappy`     → fast, tight spring for scale/press feedback (2000/80),
 *   matches the slider/switch thumb press response in the demo.
 */
export const SPRING_PRESETS = {
  morph: { type: "spring", stiffness: 400, damping: 25 } as SpringPreset,
  refractionBoost: { type: "spring", stiffness: 300, damping: 18 } as SpringPreset,
  snappy: { type: "spring", stiffness: 2000, damping: 80 } as SpringPreset,
} as const;

/**
 * Tuning constants for the live refraction boost (useMorphSprings.ts):
 * while the drawer is actively morphing, its displacement scale is
 * multiplied by a factor derived from how fast the open/close progress is
 * currently changing, then eased with SPRING_PRESETS.refractionBoost so it
 * settles back to 1 at rest — echoing the vanilla demo's velocity-driven
 * squish on the draggable lens.
 *
 * Unlike the optics constants above (verified byte-identical against the
 * vanilla demo's actual output), these two are NOT ported from anything —
 * the demo's velocity-driven effect operates on drag position in pixels,
 * not on a normalized 0–1 open/close progress value, so there's no
 * equivalent number to port. Treat these as a reasonable starting point
 * for the *feel* of the boost, meant to be tuned visually in-browser
 * rather than taken as a verified constant.
 */
export const REFRACTION_BOOST_VELOCITY_SCALE = 0.15;
/** Hard ceiling on the boost multiplier, however fast progress is changing. */
export const MAX_REFRACTION_BOOST = 1.5;

// ---------------------------------------------------------------------------
// Layout variants (blueprint D.3)
// ---------------------------------------------------------------------------

/** Closed state: a small pill that fades and shrinks to a circle. */
export const CLOSED_VARIANT = {
  width: 50,
  height: 50,
  borderRadius: "50%",
  opacity: 0,
} as const;

/**
 * Open state. width/height are intentionally left as CSS custom properties
 * ("--liquid-target-w" / "--liquid-target-h") rather than hard numbers here,
 * since the open size is per-instance and set by the consumer via props.
 */
export const OPEN_VARIANT = {
  width: "var(--liquid-target-w)",
  height: "var(--liquid-target-h)",
  borderRadius: 24,
  opacity: 1,
} as const;

/**
 * Fraction of the open/close transition that must complete before the
 * drawer's children begin fading in (blueprint E.3) — avoids rendering
 * content through heavy mid-transition distortion.
 */
export const CONTENT_REVEAL_THRESHOLD = 0.85;

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

/** Default backdrop-blur strength (px) for the dimming overlay behind the drawer. */
export const DEFAULT_OVERLAY_BLUR = 8;

/**
 * Default blur strength (px) for DrawerSurface's non-Chromium fallback
 * appearance (plain frosted `blur()`, no refraction - see DrawerSurface.tsx
 * for why). Deliberately its own constant rather than reusing
 * LiquidOpticsConfig.blur: that value is the SVG filter's internal
 * pre-blur pass applied to SourceGraphic before displacement (0.5px,
 * barely visible on its own by design) and means something different from
 * "how frosted should the fallback surface look" (needs to be much
 * stronger to read as glass with no refraction to sell the effect).
 */
export const DEFAULT_FALLBACK_BLUR = 16;

export interface TweenPreset {
  type: "tween";
  duration: number;
  ease: "easeOut" | "easeIn" | "easeInOut" | "linear";
}

/**
 * DrawerOverlay's enter/exit fade. A tween rather than a spring
 * deliberately — the overlay has no equivalent in the vanilla demo (it's
 * a standalone-widgets demo with no modal/drawer concept at all), so
 * there's no original timing to match. A snappy ease-out tween is the
 * conventional choice for a scrim fading in behind a spring-driven
 * surface; a bouncy spring on the backdrop itself tends to read as an odd
 * flicker rather than physicality, since there's no bezel/refraction
 * effect on a flat tint+blur layer to sell the motion.
 */
export const OVERLAY_TRANSITION: TweenPreset = {
  type: "tween",
  duration: 0.2,
  ease: "easeOut",
};

// ---------------------------------------------------------------------------
// Rendering mode
// ---------------------------------------------------------------------------

/**
 * Native `backdrop-filter: url(#...)` currently only works reliably in
 * Chromium. Everywhere else falls back to the "clone + filter" technique
 * from the vanilla demo. This is a *runtime* capability check (test whether
 * `element.style.backdropFilter` accepts a `url()` value — same approach the
 * demo uses), not a UA sniff, so it belongs in a hook (e.g. inside
 * DrawerSurface or a small `useBackdropFilterSupport`), not as a constant
 * here. Kept as a named type so both files agree on the shape.
 */
export type RenderMode = "backdrop-filter" | "clone-fallback";