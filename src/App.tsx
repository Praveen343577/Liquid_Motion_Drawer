import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import bgImage from "./assets/background_1.jpg";

// ── Verbatim original code from scripts.js ──────────────────────
const SurfaceEquations: Record<string, (x: number) => number> = {
  convex_circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
  convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
  concave: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),
  lip: (x) => {
    const convex = Math.pow(1 - Math.pow(1 - Math.min(x * 2, 1), 4), 1 / 4);
    const concave = 1 - Math.sqrt(1 - Math.pow(1 - x, 2)) + 0.1;
    const smootherstep = 6 * Math.pow(x, 5) - 15 * Math.pow(x, 4) + 10 * Math.pow(x, 3);
    return convex * (1 - smootherstep) + concave * smootherstep;
  },
};

class Spring {
  value: number;
  target: number;
  velocity: number;
  stiffness: number;
  damping: number;
  constructor(value: number, stiffness = 300, damping = 20) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }
  setTarget(target: number) { this.target = target; }
  update(dt: number) {
    const force = (this.target - this.value) * this.stiffness;
    const dampingForce = this.velocity * this.damping;
    this.velocity += (force - dampingForce) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
  isSettled() {
    return Math.abs(this.target - this.value) < 0.001 && Math.abs(this.velocity) < 0.001;
  }
}

function calculateDisplacementMap1D(glassThickness: number, bezelWidth: number, surfaceFn: (x: number) => number, refractiveIndex: number, samples = 128) {
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

function calculateDisplacementMap2D(cW: number, cH: number, oW: number, oH: number, radius: number, bezelWidth: number, maxDisp: number, precomputed: number[]) {
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

function detectBackdropFilterSupport() {
  const isChromium = !!(window as unknown as { chrome?: unknown }).chrome;
  const testEl = document.createElement("div");
  testEl.style.backdropFilter = "url(#test)";
  return isChromium && testEl.style.backdropFilter.includes("url");
}

// ── State Defaults ───────────────────────────────────────────
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

const SURFACE_TYPES = [
  { key: "convex_squircle", label: "Convex Squircle" },
  { key: "convex_circle", label: "Convex Circle" },
  { key: "concave", label: "Concave" },
  { key: "lip", label: "Lip" },
];

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [useBackdrop, setUseBackdrop] = useState(false);
  const [backdropSupported, setBackdropSupported] = useState(false);

  // Parameters
  const [surfaceType, setSurfaceType] = useState(DEFAULTS.surfaceType);
  const [bezelWidth, setBezelWidth] = useState(DEFAULTS.bezelWidth);
  const [glassThickness, setGlassThickness] = useState(DEFAULTS.glassThickness);
  const [refractionScale, setRefractionScale] = useState(DEFAULTS.refractionScale);
  const [specularOpacity, setSpecularOpacity] = useState(DEFAULTS.specularOpacity);
  const [blur, setBlur] = useState(DEFAULTS.blur);

  const [drawerSize, setDrawerSize] = useState({ w: window.innerWidth * 0.5, h: window.innerHeight });

  // Filter elements
  const filterBlurRef = useRef<SVGFEGaussianBlurElement>(null);
  const displacementImageRef = useRef<SVGFEImageElement>(null);
  const displacementMapRef = useRef<SVGFEDisplacementMapElement>(null);
  const specularImageRef = useRef<SVGFEImageElement>(null);
  const specularAlphaRef = useRef<SVGFEFuncAElement>(null);

  // Drawer elements
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cloneInnerRef = useRef<HTMLDivElement>(null);

  // Animation state
  const springs = useRef({
    scale: new Spring(0.8, 300, 25),
    opacity: new Spring(0, 300, 25),
    shadowOffsetX: new Spring(0, 300, 25),
    shadowOffsetY: new Spring(4, 300, 25),
    shadowBlur: new Spring(12, 300, 25),
    shadowAlpha: new Spring(0.15, 300, 25)
  }).current;
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const supported = detectBackdropFilterSupport();
    setBackdropSupported(supported);
    setUseBackdrop(supported);

    const handleResize = () => {
      setDrawerSize({
        w: window.innerWidth * 0.5, // 50% screen width
        h: window.innerHeight,
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Update Filter Maps
  const updateFilter = useCallback(() => {
    if (!filterBlurRef.current || drawerSize.w <= 0 || drawerSize.h <= 0) return;

    const surfaceFn = SurfaceEquations[surfaceType];
    if (!surfaceFn) return;

    // Standard corner radius matching the demo
    const radius = 24;

    const precomputed = calculateDisplacementMap1D(glassThickness, bezelWidth, surfaceFn, DEFAULTS.refractiveIndex);
    const maxDisp = Math.max(...precomputed.map(Math.abs));

    const dispData = calculateDisplacementMap2D(drawerSize.w, drawerSize.h, drawerSize.w, drawerSize.h, radius, bezelWidth, maxDisp || 1, precomputed);
    const specData = calculateSpecularHighlight(drawerSize.w, drawerSize.h, radius);

    const dispUrl = imageDataToDataURL(dispData);
    const specUrl = imageDataToDataURL(specData);

    displacementImageRef.current?.setAttribute("href", dispUrl);
    specularImageRef.current?.setAttribute("href", specUrl);
    displacementMapRef.current?.setAttribute("scale", String(maxDisp * refractionScale));
    specularAlphaRef.current?.setAttribute("slope", String(specularOpacity));
    filterBlurRef.current?.setAttribute("stdDeviation", String(blur));
  }, [surfaceType, bezelWidth, glassThickness, refractionScale, specularOpacity, blur, drawerSize]);

  useEffect(() => {
    updateFilter();
  }, [updateFilter]);

  // Spring Animation Loop
  useEffect(() => {
    const dt = Math.min(0.032, 1 / 60);

    if (isOpen) {
      springs.scale.setTarget(1.0);
      springs.opacity.setTarget(1.0);
      springs.shadowOffsetX.setTarget(4);
      springs.shadowOffsetY.setTarget(16);
      springs.shadowBlur.setTarget(24);
      springs.shadowAlpha.setTarget(0.22);
    } else {
      springs.scale.setTarget(0.8);
      springs.opacity.setTarget(0.0);
      springs.shadowOffsetX.setTarget(0);
      springs.shadowOffsetY.setTarget(4);
      springs.shadowBlur.setTarget(12);
      springs.shadowAlpha.setTarget(0.15);
    }

    const loop = () => {
      const scale = springs.scale.update(dt);
      const opacity = springs.opacity.update(dt);
      const sOx = springs.shadowOffsetX.update(dt);
      const sOy = springs.shadowOffsetY.update(dt);
      const sBl = springs.shadowBlur.update(dt);
      const sAl = springs.shadowAlpha.update(dt);

      if (surfaceRef.current) {
        surfaceRef.current.style.transform = `scale(${scale})`;
        surfaceRef.current.style.opacity = `${opacity}`;
        surfaceRef.current.style.pointerEvents = opacity > 0.5 ? "auto" : "none";

        const innerShadow = surfaceRef.current.querySelector(".glass-inner-shadow") as HTMLElement;
        if (innerShadow) {
          const insetAlpha = sAl * 0.6;
          innerShadow.style.boxShadow = `${sOx}px ${sOy}px ${sBl}px rgba(0, 0, 0, ${sAl}), inset ${sOx * 0.3}px ${sOy * 0.4}px 16px rgba(0, 0, 0, ${insetAlpha}), inset ${-sOx * 0.3}px ${-sOy * 0.4}px 16px rgba(255, 255, 255, ${insetAlpha * 0.8})`;
        }
      }

      // Sync clone wrapper position for filter
      if (!useBackdrop && cloneInnerRef.current && surfaceRef.current) {
        const rect = surfaceRef.current.getBoundingClientRect();
        cloneInnerRef.current.style.transform = `translate(${-rect.left}px, ${-rect.top}px)`;
      }

      if (!springs.scale.isSettled() || !springs.opacity.isSettled()) {
        rafId.current = requestAnimationFrame(loop);
      } else {
        rafId.current = null;
      }
    };

    if (!rafId.current) rafId.current = requestAnimationFrame(loop);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = null;
    };
  }, [isOpen, springs, useBackdrop]);

  // Sync clone immediately when backdrop mode toggles
  useEffect(() => {
    if (!useBackdrop && cloneInnerRef.current && surfaceRef.current) {
      const rect = surfaceRef.current.getBoundingClientRect();
      cloneInnerRef.current.style.width = `${window.innerWidth}px`;
      cloneInnerRef.current.style.height = `${window.innerHeight}px`;
      cloneInnerRef.current.style.transform = `translate(${-rect.left}px, ${-rect.top}px)`;
      if (cloneInnerRef.current.parentElement) {
        cloneInnerRef.current.parentElement.style.filter = "url(#drawerLiquidFilter)";
      }
    }
  }, [useBackdrop]);

  return (
    <>
      <div className="app-bg">
        <img src={bgImage} alt="Background" draggable={false} />
      </div>

      {/* Toggle button (Bottom Left) */}
      <button className="toggle-btn" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle Drawer">
        {isOpen ? "✕" : "◆"}
      </button>

      {/* Parameters Panel (Top Right, outside drawer) */}
      <div className="controls-panel">
        <div className="controls-header">
          <span className="controls-header-text">Parameters</span>
          <span className="controls-header-line" />
        </div>

        <div className="control-row">
          <label className="control-label">Surface Type</label>
          <div className="surface-selector">
            {SURFACE_TYPES.map((s) => (
              <button key={s.key} className={`surface-btn ${surfaceType === s.key ? "active" : ""}`} onClick={() => setSurfaceType(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-row">
          <label className="control-label">Render Mode</label>
          <div className="mode-toggle">
            <div className={`mode-toggle-switch ${useBackdrop ? "active" : ""}`} onClick={() => setUseBackdrop(!useBackdrop)} />
            <span className="mode-toggle-value">{useBackdrop ? "Backdrop-filter" : "Clone (Fallback)"}</span>
            {useBackdrop && !backdropSupported && <span style={{ fontSize: 10, color: "#f56565" }}>⚠ Not supported</span>}
          </div>
        </div>

        <div className="control-row">
          <label className="control-label">Bezel Width</label>
          <span className="control-value">{Math.round(bezelWidth)}</span>
          <input type="range" className="control-slider" min={5} max={70} value={bezelWidth} onChange={(e) => setBezelWidth(Number(e.target.value))} />
        </div>
        <div className="control-row">
          <label className="control-label">Glass Thickness</label>
          <span className="control-value">{Math.round(glassThickness)}</span>
          <input type="range" className="control-slider" min={10} max={200} value={glassThickness} onChange={(e) => setGlassThickness(Number(e.target.value))} />
        </div>
        <div className="control-row">
          <label className="control-label">Refraction Scale</label>
          <span className="control-value">{refractionScale.toFixed(2)}</span>
          <input type="range" className="control-slider" min={0} max={1.5} step={0.01} value={refractionScale} onChange={(e) => setRefractionScale(Number(e.target.value))} />
        </div>
        <div className="control-row">
          <label className="control-label">Specular Opacity</label>
          <span className="control-value">{specularOpacity.toFixed(2)}</span>
          <input type="range" className="control-slider" min={0} max={1} step={0.01} value={specularOpacity} onChange={(e) => setSpecularOpacity(Number(e.target.value))} />
        </div>
        <div className="control-row">
          <label className="control-label">Blur</label>
          <span className="control-value">{blur.toFixed(1)}</span>
          <input type="range" className="control-slider" min={0} max={10} step={0.1} value={blur} onChange={(e) => setBlur(Number(e.target.value))} />
        </div>
      </div>

      {/* Drawer (Left 50%) */}
      <div className="drawer-container">
        <div ref={surfaceRef} className={`glass-surface ${useBackdrop ? "use-backdrop-filter" : ""}`} style={{ opacity: 0, pointerEvents: "none" }}>
          
          <div className="glass-clone">
            <div ref={cloneInnerRef} className="glass-clone-inner">
              <img src={bgImage} alt="" draggable={false} />
            </div>
          </div>

          <svg className="glass-filter-svg" aria-hidden="true" style={{ position: "absolute", width: 0, height: 0 }}>
            <defs>
              <filter id="drawerLiquidFilter" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
                <feGaussianBlur ref={filterBlurRef} in="SourceGraphic" stdDeviation={blur} result="blurred" />
                <feImage ref={displacementImageRef} href="" x="0" y="0" width={drawerSize.w} height={drawerSize.h} result="displacement_map" preserveAspectRatio="none" />
                <feDisplacementMap ref={displacementMapRef} in="blurred" in2="displacement_map" scale={50} xChannelSelector="R" yChannelSelector="G" result="displaced" />
                <feColorMatrix in="displaced" type="saturate" values="1.3" result="displaced_saturated" />
                <feImage ref={specularImageRef} href="" x="0" y="0" width={drawerSize.w} height={drawerSize.h} result="specular_layer" preserveAspectRatio="none" />
                <feComponentTransfer in="specular_layer" result="specular_faded">
                  <feFuncA ref={specularAlphaRef} type="linear" slope={specularOpacity} />
                </feComponentTransfer>
                <feBlend in="specular_faded" in2="displaced_saturated" mode="screen" />
              </filter>
            </defs>
          </svg>

          <div className="glass-inner-shadow" />
        </div>
      </div>
    </>
  );
}
