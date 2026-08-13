import { useMemo } from "react";
import { motion, useTransform, type MotionValue } from "framer-motion";
import { DEFAULT_LIQUID_OPTICS } from "../../config/liquidConstants";

/**
 * 1x1 PNG, pixel = R:128 G:128 B:0 A:255 - the exact "zero displacement"
 * neutral value from liquidMath.ts's encoding (a 0 offset is stored as
 * 128 in both the R and G channels). Used as feImage's href for the
 * displacement map while useLiquidMaps hasn't resolved its first URL yet.
 * A transparent pixel would be WRONG here: it decodes to R=0, which
 * feDisplacementMap reads as a large negative offset, not "no
 * displacement." Hand-built and round-trip byte-verified, not guessed.
 */
const NEUTRAL_DISPLACEMENT_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGD4DwAEhAIACiyZ1gAAAABJRU5ErkJggg==";

/**
 * 1x1 fully transparent PNG (alpha=0). Used as feImage's href for the
 * specular map during load - since that layer is alpha-scaled and then
 * screen-blended on top, alpha=0 contributes nothing regardless of RGB,
 * which is the correct no-op here (unlike the displacement map above).
 */
const TRANSPARENT_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

export interface LiquidFilterDefsProps {
  /**
   * Unique filter id. Whatever consumes this filter (DrawerSurface) must
   * reference this exact id via backdropFilter: url(#id) / filter:
   * url(#id). Not defaulted deliberately - two mounted drawers sharing
   * one id would silently clobber each other's filter.
   */
  filterId: string;
  /** Object URL for the displacement raster from useLiquidMaps. Falls back to a neutral placeholder while null (loading). */
  displacementUrl: string | null;
  /** Object URL for the specular raster from useLiquidMaps. Falls back to a transparent placeholder while null (loading). */
  specularUrl: string | null;
  /** MUST match the width/height passed into useLiquidMaps exactly - feImage's own width/height places the raster in filter space, and a mismatch here silently misaligns the bezel from the actual raster. */
  width: number;
  height: number;
  /** Unscaled maximum displacement from useLiquidMaps. */
  maximumDisplacement: number;
  /** Static refraction multiplier (LiquidOpticsConfig.refractionScale). */
  refractionScale: number;
  /** Live per-frame boost multiplier from useMorphSprings.refractionBoost. */
  refractionBoost: MotionValue<number>;
  /** feGaussianBlur stdDeviation. Defaults to DEFAULT_LIQUID_OPTICS.blur. */
  blur?: number;
  /** feColorMatrix saturate `values`, applied to the refracted content (NOT the specular layer). Defaults to DEFAULT_LIQUID_OPTICS.saturation (1.3, the lens's value - the slider/switch demos use 7/6 respectively, pass those explicitly for that look instead). */
  saturation?: number;
  /** feFuncA linear slope for the specular highlight's alpha. Defaults to DEFAULT_LIQUID_OPTICS.specularOpacity. */
  specularOpacity?: number;
  /**
   * Percentage filter-region padding on each side, e.g. 50 -> x="-50%"
   * width="200%", matching the vanilla demo's default exactly. Widen this
   * if a large displacement is visibly clipping at the element's edge.
   */
  filterRegionPadding?: number;
}

export function LiquidFilterDefs({
  filterId,
  displacementUrl,
  specularUrl,
  width,
  height,
  maximumDisplacement,
  refractionScale,
  refractionBoost,
  blur = DEFAULT_LIQUID_OPTICS.blur,
  saturation = DEFAULT_LIQUID_OPTICS.saturation,
  specularOpacity = DEFAULT_LIQUID_OPTICS.specularOpacity,
  filterRegionPadding = 50,
}: LiquidFilterDefsProps) {
  const scale = useTransform(
    refractionBoost,
    (boost) => maximumDisplacement * refractionScale * boost,
  );

  const displacementHref = displacementUrl ?? NEUTRAL_DISPLACEMENT_PLACEHOLDER;
  const specularHref = specularUrl ?? TRANSPARENT_PLACEHOLDER;

  // feColorMatrix's `values` attribute wants a string, not a number.
  const saturationValues = useMemo(() => String(saturation), [saturation]);

  const paddingPercent = `-${filterRegionPadding}%`;
  const sizePercent = `${100 + filterRegionPadding * 2}%`;

  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter
          id={filterId}
          x={paddingPercent}
          y={paddingPercent}
          width={sizePercent}
          height={sizePercent}
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={blur}
            result="blurred"
          />
          <feImage
            href={displacementHref}
            x="0"
            y="0"
            width={width}
            height={height}
            result="displacement_map"
            preserveAspectRatio="none"
          />
          <motion.feDisplacementMap
            in="blurred"
            in2="displacement_map"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />
          <feColorMatrix
            in="displaced"
            type="saturate"
            values={saturationValues}
            result="displaced_saturated"
          />
          <feImage
            href={specularHref}
            x="0"
            y="0"
            width={width}
            height={height}
            result="specular_layer"
            preserveAspectRatio="none"
          />
          <feComponentTransfer in="specular_layer" result="specular_faded">
            <feFuncA type="linear" slope={specularOpacity} />
          </feComponentTransfer>
          <feBlend in="specular_faded" in2="displaced_saturated" mode="screen" />
        </filter>
      </defs>
    </svg>
  );
}