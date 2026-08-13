import {
  DISPLACEMENT_SAMPLES,
  SPECULAR_ANGLE,
  SPECULAR_THICKNESS,
} from "../config/liquidConstants";
import type { SurfaceEquationFn } from "./surfaceEquations";

/** [x, y] refraction vector, or null when the angle exceeds total internal reflection. */
type RefractedVector = [number, number] | null;

/**
 * Walks the bezel's surface profile from rim (x=0) to interior (x=1),
 * differentiates it to get a surface normal at each sample, refracts that
 * normal through Snell's law, and returns how far a ray displaces at each
 * point — a 1D lookup table later resampled radially in
 * calculateDisplacementMap2D.
 *
 * NOTE: `refracted[1]` (the transmitted ray's Y component) can be 0 for
 * some surface/refractiveIndex combinations, which produces Infinity/NaN
 * here exactly as it does in the original — this is inherited behavior,
 * not a bug introduced in the port. calculateDisplacementMap2D's bezelIndex
 * clamping keeps a stray NaN from propagating into most practical configs,
 * but pathological inputs (e.g. refractiveIndex very close to 1) can still
 * surface it, same as the vanilla demo.
 */
export function calculateDisplacementMap1D(
  glassThickness: number,
  bezelWidth: number,
  surfaceFn: SurfaceEquationFn,
  refractiveIndex: number,
  samples: number = DISPLACEMENT_SAMPLES,
): number[] {
  const eta = 1 / refractiveIndex;

  function refract(normalX: number, normalY: number): RefractedVector {
    const dot = normalY;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    const kSqrt = Math.sqrt(k);
    return [
      -(eta * dot + kSqrt) * normalX,
      eta - (eta * dot + kSqrt) * normalY,
    ];
  }

  const result: number[] = [];
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const y = surfaceFn(x);
    const dx = x < 1 ? 0.0001 : -0.0001;
    const y2 = surfaceFn(Math.max(0, Math.min(1, x + dx)));
    const derivative = (y2 - y) / dx;
    const magnitude = Math.sqrt(derivative * derivative + 1);
    const normal: [number, number] = [-derivative / magnitude, -1 / magnitude];
    const refracted = refract(normal[0], normal[1]);

    if (!refracted) {
      result.push(0);
    } else {
      const remainingHeightOnBezel = y * bezelWidth;
      const remainingHeight = remainingHeightOnBezel + glassThickness;
      result.push(refracted[0] * (remainingHeight / refracted[1]));
    }
  }
  return result;
}

/**
 * Projects the 1D displacement profile around a rounded rect of
 * `objectWidth` × `objectHeight` (corner radius `radius`), centered inside
 * a `canvasWidth` × `canvasHeight` bitmap. Encodes displacement into the
 * R/G channels (R = X offset, G = Y offset, both centered on 128 so 0
 * displacement = neutral gray), which is exactly what SVG's
 * `feDisplacementMap` expects to read via xChannelSelector/yChannelSelector.
 *
 * `canvasWidth`/`canvasHeight` are kept distinct from `objectWidth`/
 * `objectHeight` for cases where the filter region is padded beyond the
 * element bounds (the demo's filter uses x="-50%" y="-50%" width="200%"
 * height="200%"); pass the same values for both when no padding is needed.
 */
export function calculateDisplacementMap2D(
  canvasWidth: number,
  canvasHeight: number,
  objectWidth: number,
  objectHeight: number,
  radius: number,
  bezelWidth: number,
  maximumDisplacement: number,
  precomputedMap: number[],
): ImageData {
  const imageData = new ImageData(canvasWidth, canvasHeight);

  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 128;
    imageData.data[i + 1] = 128;
    imageData.data[i + 2] = 0;
    imageData.data[i + 3] = 255;
  }

  const radiusSquared = radius * radius;
  const radiusPlusOneSquared = (radius + 1) * (radius + 1);
  const radiusMinusBezelSquared = Math.max(
    0,
    (radius - bezelWidth) * (radius - bezelWidth),
  );
  const widthBetweenRadiuses = objectWidth - radius * 2;
  const heightBetweenRadiuses = objectHeight - radius * 2;
  const objectX = (canvasWidth - objectWidth) / 2;
  const objectY = (canvasHeight - objectHeight) / 2;

  for (let y1 = 0; y1 < objectHeight; y1++) {
    for (let x1 = 0; x1 < objectWidth; x1++) {
      const idx = ((objectY + y1) * canvasWidth + objectX + x1) * 4;
      const isOnLeftSide = x1 < radius;
      const isOnRightSide = x1 >= objectWidth - radius;
      const isOnTopSide = y1 < radius;
      const isOnBottomSide = y1 >= objectHeight - radius;

      const x = isOnLeftSide
        ? x1 - radius
        : isOnRightSide
          ? x1 - radius - widthBetweenRadiuses
          : 0;
      const y = isOnTopSide
        ? y1 - radius
        : isOnBottomSide
          ? y1 - radius - heightBetweenRadiuses
          : 0;

      const distanceToCenterSquared = x * x + y * y;
      const isInBezel =
        distanceToCenterSquared <= radiusPlusOneSquared &&
        distanceToCenterSquared >= radiusMinusBezelSquared;

      if (isInBezel) {
        const opacity =
          distanceToCenterSquared < radiusSquared
            ? 1
            : 1 -
              (Math.sqrt(distanceToCenterSquared) - Math.sqrt(radiusSquared)) /
                (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));
        const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
        const distanceFromSide = radius - distanceFromCenter;
        const cos = distanceFromCenter > 0 ? x / distanceFromCenter : 0;
        const sin = distanceFromCenter > 0 ? y / distanceFromCenter : 0;
        const bezelRatio = Math.max(
          0,
          Math.min(1, distanceFromSide / bezelWidth),
        );
        const bezelIndex = Math.floor(bezelRatio * precomputedMap.length);
        const distance =
          precomputedMap[
            Math.max(0, Math.min(bezelIndex, precomputedMap.length - 1))
          ] || 0;
        const dX =
          maximumDisplacement > 0 ? (-cos * distance) / maximumDisplacement : 0;
        const dY =
          maximumDisplacement > 0 ? (-sin * distance) / maximumDisplacement : 0;

        imageData.data[idx] = Math.max(
          0,
          Math.min(255, 128 + dX * 127 * opacity),
        );
        imageData.data[idx + 1] = Math.max(
          0,
          Math.min(255, 128 + dY * 127 * opacity),
        );
        imageData.data[idx + 2] = 0;
        imageData.data[idx + 3] = 255;
      }
    }
  }
  return imageData;
}

/**
 * Renders a directional specular glare band along the same rounded-rect
 * bezel, brightest where the edge normal aligns with `specularAngle`. Pure
 * white (RGB 255) with per-pixel alpha carrying the falloff, so it can be
 * fed straight into the filter's feComponentTransfer/feBlend stages.
 *
 * Deviation from a literal verbatim port: the vanilla demo's version of
 * this function also accepts a `bezelWidth` parameter and passes
 * `state.bezelWidth` in at every call site, but never actually reads it —
 * the specular band's thickness is controlled entirely by the separate
 * `SPECULAR_THICKNESS` constant. That's dead code in the original, not a
 * behavior this port needs to preserve, so the parameter is dropped here
 * (confirmed via a byte-for-byte output diff against the original with the
 * parameter removed — no pixel changes, since it was never used).
 */
export function calculateSpecularHighlight(
  objectWidth: number,
  objectHeight: number,
  radius: number,
  specularAngle: number = SPECULAR_ANGLE,
): ImageData {
  const imageData = new ImageData(objectWidth, objectHeight);
  const specularVector: [number, number] = [
    Math.cos(specularAngle),
    Math.sin(specularAngle),
  ];
  const specularThickness = SPECULAR_THICKNESS;
  const radiusSquared = radius * radius;
  const radiusPlusOneSquared = (radius + 1) * (radius + 1);
  const radiusMinusSpecularSquared = Math.max(
    0,
    (radius - specularThickness) * (radius - specularThickness),
  );
  const widthBetweenRadiuses = objectWidth - radius * 2;
  const heightBetweenRadiuses = objectHeight - radius * 2;

  for (let y1 = 0; y1 < objectHeight; y1++) {
    for (let x1 = 0; x1 < objectWidth; x1++) {
      const idx = (y1 * objectWidth + x1) * 4;
      const isOnLeftSide = x1 < radius;
      const isOnRightSide = x1 >= objectWidth - radius;
      const isOnTopSide = y1 < radius;
      const isOnBottomSide = y1 >= objectHeight - radius;

      const x = isOnLeftSide
        ? x1 - radius
        : isOnRightSide
          ? x1 - radius - widthBetweenRadiuses
          : 0;
      const y = isOnTopSide
        ? y1 - radius
        : isOnBottomSide
          ? y1 - radius - heightBetweenRadiuses
          : 0;

      const distanceToCenterSquared = x * x + y * y;
      const isNearEdge =
        distanceToCenterSquared <= radiusPlusOneSquared &&
        distanceToCenterSquared >= radiusMinusSpecularSquared;

      if (isNearEdge) {
        const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
        const distanceFromSide = radius - distanceFromCenter;
        const opacity =
          distanceToCenterSquared < radiusSquared
            ? 1
            : 1 -
              (distanceFromCenter - Math.sqrt(radiusSquared)) /
                (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));
        const cos = distanceFromCenter > 0 ? x / distanceFromCenter : 0;
        const sin = distanceFromCenter > 0 ? -y / distanceFromCenter : 0;
        const dotProduct = Math.abs(
          cos * specularVector[0] + sin * specularVector[1],
        );
        const edgeRatio = Math.max(
          0,
          Math.min(1, distanceFromSide / specularThickness),
        );
        const sharpFalloff = Math.sqrt(1 - (1 - edgeRatio) * (1 - edgeRatio));
        const coefficient = dotProduct * sharpFalloff;
        const color = Math.min(255, 255 * coefficient);
        const finalOpacity = Math.min(255, color * coefficient * opacity);

        imageData.data[idx] = color;
        imageData.data[idx + 1] = color;
        imageData.data[idx + 2] = color;
        imageData.data[idx + 3] = finalOpacity;
      }
    }
  }
  return imageData;
}