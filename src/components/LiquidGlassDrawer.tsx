import React, { useState, useEffect, useRef } from "react";
import "./LiquidGlassDrawer.css";

// --- Types ---
export interface LiquidGlassBoxProps {
  className?: string;
}

// --- Constants ---
const DEFAULTS = {
  surfaceType: "convex_squircle",
  bezelWidth: 30,
  drawerRadius: 24,
  glassThickness: 150,
  refractiveIndex: 1.5,
  refractionScale: 1.5,
  specularOpacity: 1,
  blur: 0.5,
  chromaticAberration: 5,
};

// Per-surface overrides for 1D sample count and displacement map blur radius.
const SURFACE_SAMPLES: Record<string, number> = {
  convex_squircle_smooth: 4096,
};
const SURFACE_DISP_BLUR: Record<string, number> = {
  convex_squircle_smooth: 3.0,
};

const SurfaceEquations: Record<string, (x: number) => number> = {
  convex_circle_o: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
  convex_circle_n: (x) => 1 - Math.cos(x * Math.PI / 2),
  convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
  convex_squircle_smooth: (x) => {
    const xs = x * x * (3 - 2 * x);
    return Math.pow(1 - Math.pow(1 - xs, 4), 1 / 4);
  },
  concave: (x) => (1 - Math.cos(x * Math.PI)) / 2,
  concave_pinch: (x) => Math.sin(x * Math.PI) * 0.18,
  lip: (x) => {
    if (x < 0.35) {
      return (1 - Math.cos((x / 0.35) * Math.PI)) * 0.15;
    } else {
      return 0.3 + (1 - Math.cos(((x - 0.35) / 0.65) * Math.PI)) * 0.35;
    }
  },
  ripple: (x) => {
    const freq = 3;
    const amplitude = 0.15;
    const envelope = Math.sin(Math.PI * x);
    return x + amplitude * Math.sin(2 * Math.PI * freq * x) * envelope;
  },
  ridge: (x) => {
    const k = 22;
    const center = 0.45;
    const sigmoid = (t: number) => 1 / (1 + Math.exp(-k * (t - center)));
    const lo = sigmoid(0);
    const hi = sigmoid(1);
    return (sigmoid(x) - lo) / (hi - lo);
  },
};

// --- Physics helpers ---
function calculateDisplacementMap1D(
  glassThickness: number,
  bezelWidth: number,
  surfaceFn: (x: number) => number,
  refractiveIndex: number,
  samples = 1024
) {
  const eta = 1 / refractiveIndex;
  function refract(normalX: number, normalY: number) {
    const dot = normalY;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    const kSqrt = Math.sqrt(k);
    return [-(eta * dot + kSqrt) * normalX, eta - (eta * dot + kSqrt) * normalY];
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
      const remainingHeight = y * bezelWidth + glassThickness;
      result.push(refracted[0] * (remainingHeight / refracted[1]));
    }
  }
  return result;
}

function getSDF(x1: number, y1: number, oW: number, oH: number, radius: number) {
  const cx = oW / 2;
  const cy = oH / 2;
  const dx = x1 - cx;
  const dy = y1 - cy;
  const px = Math.abs(dx);
  const py = Math.abs(dy);
  const qx = px - (cx - radius);
  const qy = py - (cy - radius);

  let dFS = 0;
  let nx = 0;
  let ny = 0;

  if (qx > 0 && qy > 0) {
    const len = Math.sqrt(qx * qx + qy * qy);
    dFS = radius - len;
    if (len > 0) {
      nx = -(dx > 0 ? 1 : -1) * (qx / len);
      ny = -(dy > 0 ? 1 : -1) * (qy / len);
    }
  } else {
    dFS = radius - Math.max(qx, qy);
    if (qx > qy) {
      nx = dx > 0 ? -1 : 1;
      ny = 0;
    } else {
      nx = 0;
      ny = dy > 0 ? -1 : 1;
    }
  }
  return { dFS, nx, ny };
}

function calculateDisplacementMap2D(
  cW: number,
  cH: number,
  oW: number,
  oH: number,
  radius: number,
  bezelWidth: number,
  maxDisp: number,
  precomputed: number[]
) {
  const imageData = new ImageData(cW, cH);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 128; imageData.data[i + 1] = 128;
    imageData.data[i + 2] = 0; imageData.data[i + 3] = 255;
  }

  const ox = (cW - oW) / 2;
  const oy = (cH - oH) / 2;

  for (let y1 = 0; y1 < oH; y1++) {
    for (let x1 = 0; x1 < oW; x1++) {
      const idx = ((oy + y1) * cW + ox + x1) * 4;
      const { dFS, nx, ny } = getSDF(x1, y1, oW, oH, radius);

      const aa = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      if (dFS >= -aa && dFS <= bezelWidth) {
        const op = dFS < 0 ? 1 + (dFS / aa) : 1;
        const bR = Math.max(0, dFS / bezelWidth);
        const bI_exact = bR * (precomputed.length - 1);
        const bI_low = Math.floor(bI_exact);
        const bI_high = Math.ceil(bI_exact);
        const fraction = bI_exact - bI_low;

        const dist_low = precomputed[Math.max(0, Math.min(bI_low, precomputed.length - 1))] || 0;
        const dist_high = precomputed[Math.max(0, Math.min(bI_high, precomputed.length - 1))] || 0;
        const dist = dist_low * (1 - fraction) + dist_high * fraction;

        const dX = maxDisp > 0 ? (nx * dist) / maxDisp : 0;
        const dY = maxDisp > 0 ? (ny * dist) / maxDisp : 0;

        imageData.data[idx] = Math.max(0, Math.min(255, 128 + dX * 127 * op));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, 128 + dY * 127 * op));
      }
    }
  }
  return imageData;
}

function calculateSpecularHighlight(oW: number, oH: number, radius: number, dpr = 1) {
  const imageData = new ImageData(oW, oH);
  const sv = [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)];
  const st = 1.5 * dpr;
  const aa = 1 * dpr;

  for (let y1 = 0; y1 < oH; y1++) {
    for (let x1 = 0; x1 < oW; x1++) {
      const idx = (y1 * oW + x1) * 4;
      const { dFS, nx, ny } = getSDF(x1, y1, oW, oH, radius);

      if (dFS >= -aa && dFS <= st) {
        const op = dFS < 0 ? 1 + (dFS / aa) : 1;
        const dot = Math.abs(-nx * sv[0] + ny * sv[1]);
        const eR = Math.max(0, dFS / st);
        const sharpFalloff = Math.sqrt(1 - (1 - eR) * (1 - eR));
        const coeff = dot * sharpFalloff;
        const color = Math.min(255, 255 * coeff);
        const finalOp = Math.min(255, color * coeff * op);

        imageData.data[idx] = color;
        imageData.data[idx + 1] = color;
        imageData.data[idx + 2] = color;
        imageData.data[idx + 3] = finalOp;
      }
    }
  }
  return imageData;
}

function imageDataToDataURL(imageData: ImageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

function detectBackdropFilterSupport() {
  const isChromium = !!(window as unknown as { chrome?: unknown }).chrome;
  const testEl = document.createElement("div");
  testEl.style.backdropFilter = "url(#test)";
  return isChromium && testEl.style.backdropFilter.includes("url");
}

// --- Component ---
export const LiquidGlassBox: React.FC<LiquidGlassBoxProps> = ({
  className = "",
}) => {
  const [useBackdrop, setUseBackdrop] = useState(false);

  // Parameters
  const [surfaceType] = useState(DEFAULTS.surfaceType);
  const [bezelWidth] = useState(DEFAULTS.bezelWidth);
  const [drawerRadius] = useState(DEFAULTS.drawerRadius);
  const [glassThickness] = useState(DEFAULTS.glassThickness);
  const [refractionScale] = useState(DEFAULTS.refractionScale);
  const [specularOpacity] = useState(DEFAULTS.specularOpacity);
  const [blur] = useState(DEFAULTS.blur);
  const [chromaticAberration] = useState(DEFAULTS.chromaticAberration);

  const [boxPos, setBoxPos] = useState({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 100 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 - 100 : 0,
  });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, startPos: { x: 0, y: 0 } });

  // Filter SVG elements for Box
  const filterBlurBoxRef = useRef<SVGFEGaussianBlurElement>(null);
  const displacementImageBoxRef = useRef<SVGFEImageElement>(null);
  const displacementMapRBoxRef = useRef<SVGFEDisplacementMapElement>(null);
  const displacementMapGBoxRef = useRef<SVGFEDisplacementMapElement>(null);
  const displacementMapBBoxRef = useRef<SVGFEDisplacementMapElement>(null);
  const specularImageBoxRef = useRef<SVGFEImageElement>(null);
  const specularAlphaBoxRef = useRef<SVGFEFuncAElement>(null);
  const cloneInnerBoxRef = useRef<HTMLDivElement>(null);

  // Setup Feature Detection
  useEffect(() => {
    const supported = detectBackdropFilterSupport();
    setUseBackdrop(supported);

    setBoxPos({
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 100,
    });
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, startPos: boxPos };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const newX = dragStartRef.current.startPos.x + dx;
    const newY = dragStartRef.current.startPos.y + dy;
    setBoxPos({ x: newX, y: newY });

    if (!useBackdrop && cloneInnerBoxRef.current) {
      cloneInnerBoxRef.current.style.transform = `translate(${-newX}px, ${-newY}px)`;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Sync Clone Fallback translation
  useEffect(() => {
    if (!useBackdrop && cloneInnerBoxRef.current) {
      cloneInnerBoxRef.current.style.width = `${window.innerWidth}px`;
      cloneInnerBoxRef.current.style.height = `${window.innerHeight}px`;
      cloneInnerBoxRef.current.style.transform = `translate(${-boxPos.x}px, ${-boxPos.y}px)`;
    }
  }, [useBackdrop, boxPos]);

  // Compute displacement & specular maps for the box
  useEffect(() => {
    const surfaceFn = SurfaceEquations[surfaceType];
    if (!surfaceFn) return;

    const samples = SURFACE_SAMPLES[surfaceType] ?? 1024;
    const dispBlur = SURFACE_DISP_BLUR[surfaceType] ?? 1.5;

    const dpr = window.devicePixelRatio || 1;
    const physBezelWidth = bezelWidth * dpr;

    const precomputed = calculateDisplacementMap1D(
      glassThickness,
      bezelWidth,
      surfaceFn,
      DEFAULTS.refractiveIndex,
      samples
    );
    const maxDisp = Math.max(...precomputed.map(Math.abs));

    const boxSize = 200;
    const boxRadius = Math.min(drawerRadius, 100);
    const physBoxSize = Math.round(boxSize * dpr);
    const physBoxRadius = boxRadius * dpr;

    const dispDataBox = calculateDisplacementMap2D(
      physBoxSize, physBoxSize, physBoxSize, physBoxSize,
      physBoxRadius, physBezelWidth, maxDisp || 1, precomputed
    );
    const specDataBox = calculateSpecularHighlight(physBoxSize, physBoxSize, physBoxRadius, dpr);

    displacementImageBoxRef.current?.setAttribute("href", imageDataToDataURL(dispDataBox));
    displacementImageBoxRef.current?.setAttribute("width", String(boxSize));
    displacementImageBoxRef.current?.setAttribute("height", String(boxSize));
    specularImageBoxRef.current?.setAttribute("href", imageDataToDataURL(specDataBox));
    specularImageBoxRef.current?.setAttribute("width", String(boxSize));
    specularImageBoxRef.current?.setAttribute("height", String(boxSize));

    // Update box displacement blur
    const boxDispBlurEl = document
      .querySelector("#boxDispBlur") as SVGFEGaussianBlurElement | null;
    boxDispBlurEl?.setAttribute("stdDeviation", String(dispBlur));

    const baseScale = maxDisp * refractionScale;
    const caFactor = chromaticAberration * 0.05;
    displacementMapRBoxRef.current?.setAttribute("scale", String(baseScale * (1 + caFactor)));
    displacementMapGBoxRef.current?.setAttribute("scale", String(baseScale));
    displacementMapBBoxRef.current?.setAttribute("scale", String(baseScale * (1 - caFactor)));

    specularAlphaBoxRef.current?.setAttribute("slope", String(specularOpacity));
    filterBlurBoxRef.current?.setAttribute("stdDeviation", String(blur));
  }, [surfaceType, bezelWidth, drawerRadius, glassThickness, refractionScale, specularOpacity, blur, chromaticAberration]);

  return (
    <>
      {/* Hidden SVG filter definitions */}
      <svg aria-hidden="true" style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="liquidGlassFilterBox" x="0" y="0" width="200" height="200" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur ref={filterBlurBoxRef} in="SourceGraphic" stdDeviation={blur} result="blurred" />
            <feImage ref={displacementImageBoxRef} href="" x="0" y="0" width="200" height="200" result="raw_displacement_map_box" preserveAspectRatio="none" />

            <feGaussianBlur id="boxDispBlur" in="raw_displacement_map_box" stdDeviation="1.5" result="displacement_map_box" />

            <feColorMatrix in="blurred" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red_layer_box" />
            <feColorMatrix in="blurred" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green_layer_box" />
            <feColorMatrix in="blurred" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue_layer_box" />

            <feDisplacementMap ref={displacementMapRBoxRef} in="red_layer_box" in2="displacement_map_box" scale={50} xChannelSelector="R" yChannelSelector="G" result="red_displaced_box" />
            <feDisplacementMap ref={displacementMapGBoxRef} in="green_layer_box" in2="displacement_map_box" scale={50} xChannelSelector="R" yChannelSelector="G" result="green_displaced_box" />
            <feDisplacementMap ref={displacementMapBBoxRef} in="blue_layer_box" in2="displacement_map_box" scale={50} xChannelSelector="R" yChannelSelector="G" result="blue_displaced_box" />

            <feBlend in="red_displaced_box" in2="green_displaced_box" mode="lighten" result="rg_box" />
            <feBlend in="rg_box" in2="blue_displaced_box" mode="lighten" result="displaced_aberrated_box" />

            <feColorMatrix in="displaced_aberrated_box" type="saturate" values="1.3" result="displaced_saturated_box" />
            <feImage ref={specularImageBoxRef} href="" x="0" y="0" width="200" height="200" result="specular_layer_box" preserveAspectRatio="none" />
            <feComponentTransfer in="specular_layer_box" result="specular_faded_box">
              <feFuncA ref={specularAlphaBoxRef} type="linear" slope={specularOpacity} />
            </feComponentTransfer>
            <feBlend in="specular_faded_box" in2="displaced_saturated_box" mode="screen" />
          </filter>
        </defs>
      </svg>

      {/* Draggable 200x200 liquid glass box */}
      <div
        className={`draggable-liquid-box ${useBackdrop ? "use-backdrop-filter" : ""} ${className}`}
        style={{
          position: "fixed",
          left: boxPos.x,
          top: boxPos.y,
          width: 200,
          height: 200,
          borderRadius: Math.min(drawerRadius, 100),
          zIndex: 2500,
          cursor: isDraggingRef.current ? "grabbing" : "grab",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="box-content-clone">
          <div ref={cloneInnerBoxRef} className="box-content-inner" />
        </div>
        <div className="box-inner-shadow" />
      </div>
    </>
  );
};
