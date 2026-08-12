/**
 * DrawerSurface.tsx
 *
 * The actual glass panel. Coordinates every piece built so far:
 *   - useLiquidMaps       -> displacement/specular Object URLs + maximumDisplacement
 *   - useMorphSprings     -> layout variants, contentOpacity, refractionBoost
 *   - LiquidFilterDefs    -> the SVG <filter> those two feed into
 * and renders a `motion.div` with `layout` + `variants` (blueprint E.2)
 * whose CSS references that filter via `backdropFilter: url(#filterId)`
 * for native GPU compositing.
 *
 * ---------------------------------------------------------------------
 * A real scope decision, not a shortcut: the non-Chromium fallback.
 *
 * The vanilla demo's fallback isn't a generic "refract whatever's behind
 * this element" technique - re-reading scripts.js confirms it clones a
 * SPECIFIC, AUTHOR-KNOWN piece of static markup (index.html literally
 * contains a second copy of the same frog image, sitting inert in the
 * DOM, repositioned via a CSS transform to line up with the lens) and
 * applies the SVG filter to that clone instead of the real content. That
 * only works because the demo's author knows exactly what's behind the
 * lens at build time. A reusable drawer, placed by a consumer over
 * arbitrary and dynamic app content, has no such guarantee - there's
 * nothing generic to clone. The demo's own comment even admits the
 * technique doesn't fully work anyway ("Safari is broken for whatever
 * reasons").
 *
 * Given that, this component:
 *   - Implements the Chromium-native `backdrop-filter: url(#filterId)`
 *     path in full - this is the real, generically-correct liquid
 *     refraction effect, and it's what "same liquid property as the
 *     lens" means in a reusable component.
 *   - On browsers without it, degrades to a plain `blur(...)` backdrop
 *     (no refraction, no specular highlight) rather than attempting a
 *     fragile approximation of a technique that fundamentally requires
 *     knowing the background ahead of time.
 * If you specifically need the literal clone technique for a case where
 * you DO control and know the background (e.g. a fixed hero image), that
 * would need its own opt-in prop (a background element ref) - flagging
 * this as a deliberate follow-up rather than something quietly missing.
 *
 * Feature detection is ported directly from scripts.js's
 * detectBackdropFilterSupport() (isChromium && a test element's
 * backdropFilter style actually retains a url() value after assignment -
 * Firefox/Safari strip it back out, which is what the check relies on).
 * ---------------------------------------------------------------------
 */

import { forwardRef, useEffect, useId, useLayoutEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  DEFAULT_FALLBACK_BLUR,
  DEFAULT_LIQUID_OPTICS,
  OPEN_VARIANT,
  type LiquidOpticsConfig,
  type RenderMode,
} from "../../config/liquidConstants";
import { useLiquidMaps } from "../../hooks/useLiquidMaps";
import { useMorphSprings } from "../../hooks/useMorphSprings";
import { LiquidFilterDefs } from "./LiquidFilterDefs";

/**
 * Ported from scripts.js's detectBackdropFilterSupport(): Chromium-gated
 * because that's genuinely what the vanilla demo found necessary (some
 * non-Chromium engines can accept the url() assignment without applying
 * it correctly), not just a convenient proxy for "supports backdrop-filter
 * url() filters." SSR-safe - returns "clone-fallback" as the conservative
 * default when window/document aren't available yet.
 */
function detectRenderMode(): RenderMode {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "clone-fallback";
  }
  const isChromium = !!(window as unknown as { chrome?: unknown }).chrome;
  const testEl = document.createElement("div");
  testEl.style.backdropFilter = "url(#test)";
  const supportsBackdropFilterUrl = testEl.style.backdropFilter.includes("url");
  return isChromium && supportsBackdropFilterUrl ? "backdrop-filter" : "clone-fallback";
}

/** CSSProperties plus the two custom properties OPEN_VARIANT's width/height reference. */
type SurfaceCSSProperties = CSSProperties & {
  "--liquid-target-w"?: string;
  "--liquid-target-h"?: string;
};

export interface DrawerSurfaceProps {
  /** Whether the drawer is open. Drives useMorphSprings and the variant in use. */
  isOpen: boolean;
  /** Target ("Open") pixel width. */
  width: number;
  /** Target ("Open") pixel height. */
  height: number;
  /** Corner radius, px. Defaults to OPEN_VARIANT's own borderRadius (24) so the raster maps' rounded-rect shape matches the CSS shape by default. */
  radius?: number;
  /** Optics config, merged over DEFAULT_LIQUID_OPTICS. Pass a partial object - only override what you need. */
  optics?: Partial<LiquidOpticsConfig>;
  /** Scales the peak refraction boost during the open/close transition. Forwarded to useMorphSprings. */
  boostIntensity?: number;
  /** Explicit filter id, for advanced cases (e.g. synchronizing two surfaces). Defaults to a generated, collision-safe id. */
  filterId?: string;
  /** ARIA role for the panel. Defaults to "dialog" - pass "region" or similar for a non-modal drawer used without DrawerOverlay. */
  role?: string;
  /** Accessible name for the dialog role. Strongly recommended when role="dialog" (the default). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  style?: CSSProperties;
  /**
   * Optional click handler. Meaningful on this component specifically
   * because, per blueprint D.3's CLOSED_VARIANT, the surface stays
   * permanently mounted as a small pill even when closed - it's not
   * something that unmounts, so it can double as its own trigger (e.g.
   * LiquidMotionDrawer wires this to open the drawer while closed).
   */
  onClick?: () => void;
  /**
   * DOM tabIndex. Defaults to -1 (programmatically focusable only, e.g.
   * for moving focus into the open dialog, but not Tab-reachable).
   * Callers using `onClick` as a trigger should pass 0 so the pill is
   * keyboard-reachable - when onClick is set, Enter/Space are handled
   * automatically to activate it (matching native button semantics),
   * regardless of what tabIndex is passed.
   */
  tabIndex?: number;
  /** Additional keydown handler, called before the built-in Enter/Space-activates-onClick behavior. */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}

export const DrawerSurface = forwardRef<HTMLDivElement, DrawerSurfaceProps>(
  function DrawerSurface(
    {
      isOpen,
      width,
      height,
      radius = OPEN_VARIANT.borderRadius,
      optics,
      boostIntensity,
      filterId: filterIdProp,
      role = "dialog",
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      className,
      style,
      onClick,
      tabIndex = -1,
      onKeyDown,
      children,
    },
    ref,
  ) {
    // useId() output contains colons (e.g. ":r0:"), which are unsafe to
    // drop directly into a url(#...) fragment reference without escaping.
    // Stripping them is simpler and just as collision-safe as the
    // original, since uniqueness came from the surrounding digits/letters
    // React generates, not from the colons themselves.
    const reactId = useId().replace(/:/g, "");
    const filterId = filterIdProp ?? `liquid-drawer-filter-${reactId}`;

    const resolvedOptics: LiquidOpticsConfig = { ...DEFAULT_LIQUID_OPTICS, ...optics };

    const { displacementUrl, specularUrl, maximumDisplacement, error } = useLiquidMaps({
      width,
      height,
      radius,
      surfaceType: resolvedOptics.surfaceType,
      bezelWidth: resolvedOptics.bezelWidth,
      glassThickness: resolvedOptics.glassThickness,
      refractiveIndex: resolvedOptics.refractiveIndex,
    });

    const { motionProps, contentOpacity, refractionBoost } = useMorphSprings({
      isOpen,
      boostIntensity,
    });

    // Surfaced for visibility rather than silently swallowed - a canvas
    // context failure (e.g. an exotic embedded webview) shouldn't fail
    // invisibly. Doesn't change rendering: LiquidFilterDefs already
    // renders a correct neutral (zero-displacement) result whenever the
    // URLs are null, whether that's "still loading" or "failed."
    useEffect(() => {
      if (error) {
        console.error("DrawerSurface: liquid map generation failed.", error);
      }
    }, [error]);

    // Resolved via useLayoutEffect (not useEffect) so it settles before
    // the browser paints, avoiding a visible flash of the wrong backdrop
    // style for whichever branch turns out to be wrong. Starts optimistic
    // ("backdrop-filter") since that's the common case (Chromium) this
    // component is built around, and detectRenderMode is a synchronous,
    // fast DOM check - the corrected value, if different, lands before
    // first paint on every real client render.
    const [renderMode, setRenderMode] = useState<RenderMode>("backdrop-filter");
    useLayoutEffect(() => {
      setRenderMode(detectRenderMode());
    }, []);

    const backdropStyle: CSSProperties =
      renderMode === "backdrop-filter"
        ? { backdropFilter: `url(#${filterId})` }
        : {
            // Plain frosted blur - no refraction/specular, see file header.
            backdropFilter: `blur(${DEFAULT_FALLBACK_BLUR}px)`,
            WebkitBackdropFilter: `blur(${DEFAULT_FALLBACK_BLUR}px)`,
          };

    const surfaceStyle: SurfaceCSSProperties = {
      overflow: "hidden",
      "--liquid-target-w": `${width}px`,
      "--liquid-target-h": `${height}px`,
      ...backdropStyle,
      ...style,
    };

    // Plain divs don't natively activate on Enter/Space the way <button>
    // does - if this surface is being used as its own trigger (onClick +
    // tabIndex=0), this restores that expected keyboard behavior. Chained
    // after any consumer-supplied onKeyDown rather than replacing it.
    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      onKeyDown?.(event);
      if (onClick && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        onClick();
      }
    }

    return (
      <>
        <motion.div
          ref={ref}
          role={role}
          aria-modal={role === "dialog" ? isOpen : undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          tabIndex={tabIndex}
          onClick={onClick}
          onKeyDown={handleKeyDown}
          className={className}
          style={surfaceStyle}
          {...motionProps}
        >
          <motion.div style={{ opacity: contentOpacity, width: "100%", height: "100%" }}>
            {children}
          </motion.div>
        </motion.div>
        <LiquidFilterDefs
          filterId={filterId}
          displacementUrl={displacementUrl}
          specularUrl={specularUrl}
          width={width}
          height={height}
          maximumDisplacement={maximumDisplacement}
          refractionScale={resolvedOptics.refractionScale}
          refractionBoost={refractionBoost}
          blur={resolvedOptics.blur}
          saturation={resolvedOptics.saturation}
          specularOpacity={resolvedOptics.specularOpacity}
        />
      </>
    );
  },
);