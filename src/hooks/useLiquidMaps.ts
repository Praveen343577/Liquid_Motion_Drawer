import { useEffect, useRef, useState } from "react";
import type { LiquidOpticsConfig } from "../config/liquidConstants";
import { DISPLACEMENT_SAMPLES, SPECULAR_ANGLE } from "../config/liquidConstants";
import { getSurfaceEquation } from "../core/surfaceEquations";
import { calculateDisplacementMap1D, calculateDisplacementMap2D, calculateSpecularHighlight } from "../core/liquidMath";
import { imageDataToObjectURL, revokeObjectURL } from "../core/imageRenderer";

/**
 * The subset of LiquidOpticsConfig that actually changes the raster output
 * and therefore justifies a recompute. Derived with Pick rather than
 * hand-retyped so this stays in sync automatically if LiquidOpticsConfig's
 * fields are ever renamed.
 */
export type LiquidMapsOptics = Pick<
  LiquidOpticsConfig,
  "surfaceType" | "bezelWidth" | "glassThickness" | "refractiveIndex"
>;

export interface UseLiquidMapsOptions extends LiquidMapsOptics {
  /** Target ("Open") pixel width of the drawer surface. */
  width: number;
  /** Target ("Open") pixel height of the drawer surface. */
  height: number;
  /** Corner radius, in px. Clamped internally to at most min(width, height) / 2. */
  radius: number;
  /** Radial sample count for the 1D profile. Rarely needs overriding. */
  samples?: number;
  /** Light angle (radians) for the specular highlight. Rarely needs overriding. */
  specularAngle?: number;
}

export interface LiquidMaps {
  /** Object URL for the displacement map, or null until the first map finishes rendering. */
  displacementUrl: string | null;
  /** Object URL for the specular highlight map, or null until the first map finishes rendering. */
  specularUrl: string | null;
  /** Unscaled maximum displacement magnitude from the 1D profile — multiply by a live refractionScale before feeding feDisplacementMap's `scale`. */
  maximumDisplacement: number;
  /** True while a (re)computation is in flight. */
  isLoading: boolean;
  /** Set if rasterization failed (e.g. canvas context unavailable). */
  error: Error | null;
}

const INITIAL_STATE: LiquidMaps = {
  displacementUrl: null,
  specularUrl: null,
  maximumDisplacement: 0,
  isLoading: true,
  error: null,
};

export function useLiquidMaps({
  width,
  height,
  radius,
  surfaceType,
  glassThickness,
  bezelWidth,
  refractiveIndex,
  samples = DISPLACEMENT_SAMPLES,
  specularAngle = SPECULAR_ANGLE,
}: UseLiquidMapsOptions): LiquidMaps {
  const [maps, setMaps] = useState<LiquidMaps>(INITIAL_STATE);

  // Mirrors whatever URLs are currently committed to `maps`, read at
  // cleanup time. A ref (not the `maps` state itself) because the
  // final-unmount effect below needs the *latest* committed value without
  // re-subscribing every time `maps` changes.
  const committedUrlsRef = useRef<{
    displacementUrl: string | null;
    specularUrl: string | null;
  }>({ displacementUrl: null, specularUrl: null });

  useEffect(() => {
    // Guards two race conditions inherent to "generate maps asynchronously,
    // then commit them to state": (a) the component unmounts before the
    // Blob/Object URL finishes rendering, and (b) a dependency changes
    // again — e.g. width updates twice in quick succession during a resize
    // — before the *first* call's promise resolves, which without this
    // guard could let the stale first result overwrite the newer second
    // one depending on Promise scheduling order.
    let cancelled = false;

    // A drawer measured mid-layout (e.g. before its container has been
    // sized) can briefly report 0 or negative dimensions. Generating a
    // 0×0 ImageData throws, so skip the run entirely rather than surface
    // that as an `error`.
    if (width <= 0 || height <= 0) {
      setMaps((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    setMaps((prev) => ({ ...prev, isLoading: true, error: null }));

    const surfaceFn = getSurfaceEquation(surfaceType);
    const clampedRadius = Math.max(0, Math.min(radius, Math.min(width, height) / 2));

    // --- Cheap, synchronous math first ---
    const displacementProfile1D = calculateDisplacementMap1D(
      glassThickness,
      bezelWidth,
      surfaceFn,
      refractiveIndex,
      samples,
    );
    const maximumDisplacement = displacementProfile1D.reduce(
      (max, value) => Math.max(max, Math.abs(value)),
      0,
    );
    const displacementImageData = calculateDisplacementMap2D(
      width,
      height,
      width,
      height,
      clampedRadius,
      bezelWidth,
      maximumDisplacement,
      displacementProfile1D,
    );
    const specularImageData = calculateSpecularHighlight(
      width,
      height,
      clampedRadius,
      specularAngle,
    );

    // --- Async: rasterize both maps to Blob-backed Object URLs ---
    Promise.all([
      imageDataToObjectURL(displacementImageData),
      imageDataToObjectURL(specularImageData),
    ])
      .then(([displacementUrl, specularUrl]) => {
        if (cancelled) {
          // A newer run (or unmount) already superseded this one. Revoke
          // immediately rather than committing — otherwise these Blobs
          // would leak, referenced by nothing, for the life of the
          // document.
          revokeObjectURL(displacementUrl);
          revokeObjectURL(specularUrl);
          return;
        }

        revokeObjectURL(committedUrlsRef.current.displacementUrl);
        revokeObjectURL(committedUrlsRef.current.specularUrl);
        committedUrlsRef.current = { displacementUrl, specularUrl };

        setMaps({
          displacementUrl,
          specularUrl,
          maximumDisplacement,
          isLoading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMaps((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [width, height, radius, surfaceType, glassThickness, bezelWidth, refractiveIndex, samples, specularAngle]);

  // Final-unmount cleanup. The per-run cleanup above only sets `cancelled`
  // — it doesn't revoke a *successfully committed* URL, because on a
  // dependency-change re-run that URL is still in active use until the new
  // one replaces it (handled in the `.then` above). This effect's cleanup
  // fires exactly once, when the component actually unmounts, and revokes
  // whatever is live at that moment.
  useEffect(() => {
    return () => {
      revokeObjectURL(committedUrlsRef.current.displacementUrl);
      revokeObjectURL(committedUrlsRef.current.specularUrl);
    };
  }, []);

  return maps;
}