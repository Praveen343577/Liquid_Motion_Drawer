import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import bgImage from "./assets/background_1.jpg";

// ── Surface equations (verbatim from original demo) ──────────
const SurfaceEquations: Record<string, (x: number) => number> = {
  convex_circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
  convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
  concave: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),
  lip: (x) => {
    const convex = Math.pow(1 - Math.pow(1 - Math.min(x * 2, 1), 4), 1 / 4);
    const concave = 1 - Math.sqrt(1 - Math.pow(1 - x, 2)) + 0.1;
    const s = 6 * Math.pow(x, 5) - 15 * Math.pow(x, 4) + 10 * Math.pow(x, 3);
    return convex * (1 - s) + concave * s;
  },
};

// ── Displacement map computation (verbatim) ──────────────────
function calculateDisplacementMap1D(
  glassThickness: number,
  bezelWidth: number,
  surfaceFn: (x: number) => number,
  refractiveIndex: number,
  samples = 128,
) {
  const eta = 1 / refractiveIndex;
  function refract(normalX: number, normalY: number) {
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
      const remainingHeight = y * bezelWidth + glassThickness;
      result.push(refracted[0] * (remainingHeight / refracted[1]));
    }
  }
  return result;
}

function calculateDisplacementMap2D(
  cW: number, cH: number, oW: number, oH: number,
  radius: number, bezelWidth: number, maxDisp: number, precomputed: number[],
) {
  const imageData = new ImageData(cW, cH);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 128; imageData.data[i + 1] = 128;
    imageData.data[i + 2] = 0; imageData.data[i + 3] = 255;
  }
  const rSq = radius * radius;
  const rp1Sq = (radius + 1) ** 2;
  const rmbSq = Math.max(0, (radius - bezelWidth) ** 2);
  const wBR = oW - radius * 2;
  const hBR = oH - radius * 2;
  const ox = (cW - oW) / 2;
  const oy = (cH - oH) / 2;
  for (let y1 = 0; y1 < oH; y1++) {
    for (let x1 = 0; x1 < oW; x1++) {
      const idx = ((oy + y1) * cW + ox + x1) * 4;
      const x = x1 < radius ? x1 - radius : x1 >= oW - radius ? x1 - radius - wBR : 0;
      const y = y1 < radius ? y1 - radius : y1 >= oH - radius ? y1 - radius - hBR : 0;
      const d2 = x * x + y * y;
      if (d2 <= rp1Sq && d2 >= rmbSq) {
        const op = d2 < rSq ? 1 : 1 - (Math.sqrt(d2) - Math.sqrt(rSq)) / (Math.sqrt(rp1Sq) - Math.sqrt(rSq));
        const dFC = Math.sqrt(d2);
        const dFS = radius - dFC;
        const cos = dFC > 0 ? x / dFC : 0;
        const sin = dFC > 0 ? y / dFC : 0;
        const bR = Math.max(0, Math.min(1, dFS / bezelWidth));
        const bI = Math.floor(bR * precomputed.length);
        const dist = precomputed[Math.max(0, Math.min(bI, precomputed.length - 1))] || 0;
        const dX = maxDisp > 0 ? (-cos * dist) / maxDisp : 0;
        const dY = maxDisp > 0 ? (-sin * dist) / maxDisp : 0;
        imageData.data[idx] = Math.max(0, Math.min(255, 128 + dX * 127 * op));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, 128 + dY * 127 * op));
        imageData.data[idx + 2] = 0;
        imageData.data[idx + 3] = 255;
      }
    }
  }
  return imageData;
}

function calculateSpecularHighlight(oW: number, oH: number, radius: number) {
  const imageData = new ImageData(oW, oH);
  const sv = [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)];
  const st = 1.5;
  const rSq = radius * radius;
  const rp1Sq = (radius + 1) ** 2;
  const rmsSq = Math.max(0, (radius - st) ** 2);
  const wBR = oW - radius * 2;
  const hBR = oH - radius * 2;
  for (let y1 = 0; y1 < oH; y1++) {
    for (let x1 = 0; x1 < oW; x1++) {
      const idx = (y1 * oW + x1) * 4;
      const x = x1 < radius ? x1 - radius : x1 >= oW - radius ? x1 - radius - wBR : 0;
      const y = y1 < radius ? y1 - radius : y1 >= oH - radius ? y1 - radius - hBR : 0;
      const d2 = x * x + y * y;
      if (d2 <= rp1Sq && d2 >= rmsSq) {
        const dFC = Math.sqrt(d2);
        const dFS = radius - dFC;
        const op = d2 < rSq ? 1 : 1 - (dFC - Math.sqrt(rSq)) / (Math.sqrt(rp1Sq) - Math.sqrt(rSq));
        const cos = dFC > 0 ? x / dFC : 0;
        const sin = dFC > 0 ? -y / dFC : 0;
        const dot = Math.abs(cos * sv[0] + sin * sv[1]);
        const eR = Math.max(0, Math.min(1, dFS / st));
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

// ── Feature detection (same as original) ─────────────────────
function detectBackdropFilterSupport() {
  const isChromium = !!(window as unknown as { chrome?: unknown }).chrome;
  const testEl = document.createElement("div");
  testEl.style.backdropFilter = "url(#test)";
  const supports = testEl.style.backdropFilter.includes("url");
  return isChromium && supports;
}

// ── Drawer dimensions ────────────────────────────────────────
const DRAWER_W = 420;
const DRAWER_H = 520;
const DRAWER_RADIUS = 24;

// ── Default state (matches original demo) ────────────────────
const DEFAULTS = {
  surfaceType: "convex_squircle",
  bezelWidth: 30,
  glassThickness: 150,
  refractiveIndex: 1.5,
  refractionScale: 1.5,
  specularOpacity: 1,
  saturation: 1.3,
  blur: 0.5,
};

// ── Surface type labels ──────────────────────────────────────
const SURFACE_TYPES = [
  { key: "convex_squircle", label: "Convex Squircle" },
  { key: "convex_circle", label: "Convex Circle" },
  { key: "concave", label: "Concave" },
  { key: "lip", label: "Lip" },
];

// ══════════════════════════════════════════════════════════════
export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [useBackdrop, setUseBackdrop] = useState(false);
  const [backdropSupported, setBackdropSupported] = useState(false);

  // Parameters state
  const [surfaceType, setSurfaceType] = useState(DEFAULTS.surfaceType);
  const [bezelWidth, setBezelWidth] = useState(DEFAULTS.bezelWidth);
  const [glassThickness, setGlassThickness] = useState(DEFAULTS.glassThickness);
  const [refractionScale, setRefractionScale] = useState(DEFAULTS.refractionScale);
  const [specularOpacity, setSpecularOpacity] = useState(DEFAULTS.specularOpacity);
  const [blur, setBlur] = useState(DEFAULTS.blur);

  // Filter element refs
  const displacementImageRef = useRef<SVGFEImageElement>(null);
  const specularImageRef = useRef<SVGFEImageElement>(null);
  const displacementMapRef = useRef<SVGFEDisplacementMapElement>(null);
  const specularAlphaRef = useRef<SVGFEFuncAElement>(null);
  const filterBlurRef = useRef<SVGFEGaussianBlurElement>(null);

  // Clone positioning ref
  const cloneInnerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Detect support on mount
  useEffect(() => {
    const supported = detectBackdropFilterSupport();
    setBackdropSupported(supported);
    setUseBackdrop(supported);
  }, []);

  // ── Compute and apply filter maps ───────────────────────
  const updateFilter = useCallback(() => {
    const surfaceFn = SurfaceEquations[surfaceType];
    if (!surfaceFn) return;

    const precomputed = calculateDisplacementMap1D(
      glassThickness, bezelWidth, surfaceFn, DEFAULTS.refractiveIndex,
    );
    const maxDisp = Math.max(...precomputed.map(Math.abs));

    const dispData = calculateDisplacementMap2D(
      DRAWER_W, DRAWER_H, DRAWER_W, DRAWER_H,
      DRAWER_RADIUS, bezelWidth, maxDisp || 1, precomputed,
    );
    const specData = calculateSpecularHighlight(DRAWER_W, DRAWER_H, DRAWER_RADIUS);

    const dispUrl = imageDataToDataURL(dispData);
    const specUrl = imageDataToDataURL(specData);

    displacementImageRef.current?.setAttribute("href", dispUrl);
    specularImageRef.current?.setAttribute("href", specUrl);
    displacementMapRef.current?.setAttribute("scale", String(maxDisp * refractionScale));
    specularAlphaRef.current?.setAttribute("slope", String(specularOpacity));
    filterBlurRef.current?.setAttribute("stdDeviation", String(blur));
  }, [surfaceType, bezelWidth, glassThickness, refractionScale, specularOpacity, blur]);

  useEffect(() => {
    updateFilter();
  }, [updateFilter]);

  // ── Update clone position to match background ───────────
  useEffect(() => {
    function updateClonePosition() {
      if (useBackdrop || !cloneInnerRef.current || !surfaceRef.current) return;
      const rect = surfaceRef.current.getBoundingClientRect();
      const inner = cloneInnerRef.current;
      inner.style.width = window.innerWidth + "px";
      inner.style.height = window.innerHeight + "px";
      inner.style.transform = `translate(${-rect.left}px, ${-rect.top}px)`;
    }
    updateClonePosition();
    window.addEventListener("resize", updateClonePosition);
    // Also update when drawer opens/closes or position could change
    const id = requestAnimationFrame(updateClonePosition);
    return () => {
      window.removeEventListener("resize", updateClonePosition);
      cancelAnimationFrame(id);
    };
  }, [isOpen, useBackdrop]);

  // Apply filter to clone element
  useEffect(() => {
    if (!useBackdrop && cloneInnerRef.current?.parentElement) {
      cloneInnerRef.current.parentElement.style.filter = "url(#drawerLiquidFilter)";
    }
  }, [useBackdrop, surfaceType, bezelWidth, glassThickness, refractionScale, specularOpacity, blur]);

  function toggleRenderMode() {
    setUseBackdrop((prev) => !prev);
  }

  return (
    <>
      {/* Full-screen background image */}
      <div className="app-bg">
        <img src={bgImage} alt="Background" draggable={false} />
      </div>

      {/* Toggle button */}
      <button
        className="toggle-btn"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close drawer" : "Open drawer"}
      >
        {isOpen ? "✕" : "◆"}
      </button>

      {/* Drawer */}
      <div className={`drawer-wrapper ${isOpen ? "open" : ""}`}>
        <div
          ref={surfaceRef}
          className={`glass-surface ${useBackdrop ? "use-backdrop-filter" : ""}`}
        >
          {/* Clone of background (filtered) */}
          <div className="glass-clone">
            <div ref={cloneInnerRef} className="glass-clone-inner">
              <img src={bgImage} alt="" draggable={false} />
            </div>
          </div>

          {/* SVG filter definition */}
          <svg className="glass-filter-svg" aria-hidden="true">
            <defs>
              <filter
                id="drawerLiquidFilter"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur
                  ref={filterBlurRef}
                  in="SourceGraphic"
                  stdDeviation={blur}
                  result="blurred"
                />
                <feImage
                  ref={displacementImageRef}
                  href=""
                  x="0"
                  y="0"
                  width={DRAWER_W}
                  height={DRAWER_H}
                  result="displacement_map"
                  preserveAspectRatio="none"
                />
                <feDisplacementMap
                  ref={displacementMapRef}
                  in="blurred"
                  in2="displacement_map"
                  scale={50}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="displaced"
                />
                <feColorMatrix
                  in="displaced"
                  type="saturate"
                  values="1.3"
                  result="displaced_saturated"
                />
                <feImage
                  ref={specularImageRef}
                  href=""
                  x="0"
                  y="0"
                  width={DRAWER_W}
                  height={DRAWER_H}
                  result="specular_layer"
                  preserveAspectRatio="none"
                />
                <feComponentTransfer in="specular_layer" result="specular_faded">
                  <feFuncA ref={specularAlphaRef} type="linear" slope={specularOpacity} />
                </feComponentTransfer>
                <feBlend in="specular_faded" in2="displaced_saturated" mode="screen" />
              </filter>
            </defs>
          </svg>

          {/* Inner shadow (bezel look) */}
          <div className="glass-inner-shadow" />

          {/* Drawer content: Parameters panel */}
          <div className="drawer-content">
            <div className="controls-panel">
              <div className="controls-header">
                <span className="controls-header-text">Parameters</span>
                <span className="controls-header-line" />
              </div>

              {/* Surface Type */}
              <div className="control-row">
                <label className="control-label">Surface Type</label>
                <div className="surface-selector">
                  {SURFACE_TYPES.map((s) => (
                    <button
                      key={s.key}
                      className={`surface-btn ${surfaceType === s.key ? "active" : ""}`}
                      onClick={() => setSurfaceType(s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Render Mode */}
              <div className="control-row">
                <label className="control-label">Render Mode</label>
                <div className="mode-toggle">
                  <div
                    className={`mode-toggle-switch ${useBackdrop ? "active" : ""}`}
                    onClick={toggleRenderMode}
                    title="Toggle between backdrop-filter and clone fallback"
                  />
                  <span className="mode-toggle-value">
                    {useBackdrop ? "Backdrop-filter" : "Clone (Fallback)"}
                  </span>
                  {useBackdrop && !backdropSupported && (
                    <span style={{ fontSize: 10, color: "#f56565" }}>
                      ⚠ Not supported
                    </span>
                  )}
                </div>
              </div>

              {/* Bezel Width */}
              <div className="control-row">
                <label className="control-label">Bezel Width</label>
                <span className="control-value">{Math.round(bezelWidth)}</span>
                <input
                  type="range"
                  className="control-slider"
                  min={5}
                  max={70}
                  value={bezelWidth}
                  onChange={(e) => setBezelWidth(Number(e.target.value))}
                />
              </div>

              {/* Glass Thickness */}
              <div className="control-row">
                <label className="control-label">Glass Thickness</label>
                <span className="control-value">{Math.round(glassThickness)}</span>
                <input
                  type="range"
                  className="control-slider"
                  min={10}
                  max={200}
                  value={glassThickness}
                  onChange={(e) => setGlassThickness(Number(e.target.value))}
                />
              </div>

              {/* Refraction Scale */}
              <div className="control-row">
                <label className="control-label">Refraction Scale</label>
                <span className="control-value">{refractionScale.toFixed(2)}</span>
                <input
                  type="range"
                  className="control-slider"
                  min={0}
                  max={1.5}
                  step={0.01}
                  value={refractionScale}
                  onChange={(e) => setRefractionScale(Number(e.target.value))}
                />
              </div>

              {/* Specular Opacity */}
              <div className="control-row">
                <label className="control-label">Specular Opacity</label>
                <span className="control-value">{specularOpacity.toFixed(2)}</span>
                <input
                  type="range"
                  className="control-slider"
                  min={0}
                  max={1}
                  step={0.01}
                  value={specularOpacity}
                  onChange={(e) => setSpecularOpacity(Number(e.target.value))}
                />
              </div>

              {/* Blur */}
              <div className="control-row">
                <label className="control-label">Blur</label>
                <span className="control-value">{blur.toFixed(1)}</span>
                <input
                  type="range"
                  className="control-slider"
                  min={0}
                  max={10}
                  step={0.1}
                  value={blur}
                  onChange={(e) => setBlur(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
