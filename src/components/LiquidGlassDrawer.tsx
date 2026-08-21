import React, { useState, useEffect, useRef, type ReactNode } from "react";
import "./LiquidGlassDrawer.css";

// --- Types ---
export interface LiquidGlassDrawerProps {
  isOpen: boolean;
  children?: ReactNode; // Main app content to be cloned as fallback
  className?: string;
}

interface PhysicsState {
  scale: Spring;
  opacity: Spring;
  shadowOffsetX: Spring;
  shadowOffsetY: Spring;
  shadowBlur: Spring;
  shadowAlpha: Spring;
}

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

const SURFACE_TYPES = [
  { key: "convex_squircle", label: "Convex Squircle" },
  { key: "convex_circle", label: "Convex Circle" },
  { key: "concave", label: "Concave" },
  { key: "lip", label: "Lip" },
  { key: "ripple", label: "Ripple" },
  { key: "ridge", label: "Ridge" },
];

const SurfaceEquations: Record<string, (x: number) => number> = {
  convex_circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
  convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
  concave: (x) => (1 - Math.cos(x * Math.PI)) / 2,
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
    return (sigmoid(x) - lo) / (hi - lo); // normalize to [0, 1]
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

function calculateDisplacementMap1D(glassThickness: number, bezelWidth: number, surfaceFn: (x: number) => number, refractiveIndex: number, samples = 1024) {
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

function calculateDisplacementMap2D(cW: number, cH: number, oW: number, oH: number, radius: number, bezelWidth: number, maxDisp: number, precomputed: number[]) {
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
  const aa = 1 * dpr; // antialiasing bleed

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
export const LiquidGlassDrawer: React.FC<LiquidGlassDrawerProps> = ({
  isOpen,
  children,
  className = "",
}) => {
  const [useBackdrop, setUseBackdrop] = useState(false);
  const [backdropSupported, setBackdropSupported] = useState(false);

  // Parameters
  const [surfaceType, setSurfaceType] = useState(DEFAULTS.surfaceType);
  const [bezelWidth, setBezelWidth] = useState(DEFAULTS.bezelWidth);
  const [drawerRadius, setDrawerRadius] = useState(DEFAULTS.drawerRadius);
  const [glassThickness, setGlassThickness] = useState(DEFAULTS.glassThickness);
  const [refractionScale, setRefractionScale] = useState(DEFAULTS.refractionScale);
  const [specularOpacity, setSpecularOpacity] = useState(DEFAULTS.specularOpacity);
  const [blur, setBlur] = useState(DEFAULTS.blur);
  const [chromaticAberration, setChromaticAberration] = useState(DEFAULTS.chromaticAberration);

  const [drawerSize, setDrawerSize] = useState({ w: 0, h: 0 });
  const [boxPos, setBoxPos] = useState({ 
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 25 : 0, 
    y: typeof window !== 'undefined' ? window.innerHeight / 2 - 25 : 0 
  });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, startPos: { x: 0, y: 0 } });

  // Refs for direct DOM manipulation (Bypassing React cycle)
  const drawerRef = useRef<HTMLDivElement>(null);
  const cloneInnerRef = useRef<HTMLDivElement>(null);
  
  // Filter SVG elements
  const filterBlurRef = useRef<SVGFEGaussianBlurElement>(null);
  const displacementImageRef = useRef<SVGFEImageElement>(null);
  const displacementMapRRef = useRef<SVGFEDisplacementMapElement>(null);
  const displacementMapGRef = useRef<SVGFEDisplacementMapElement>(null);
  const displacementMapBRef = useRef<SVGFEDisplacementMapElement>(null);
  const specularImageRef = useRef<SVGFEImageElement>(null);
  const specularAlphaRef = useRef<SVGFEFuncAElement>(null);

  // Filter SVG elements for Box
  const filterBlurBoxRef = useRef<SVGFEGaussianBlurElement>(null);
  const displacementImageBoxRef = useRef<SVGFEImageElement>(null);
  const displacementMapRBoxRef = useRef<SVGFEDisplacementMapElement>(null);
  const displacementMapGBoxRef = useRef<SVGFEDisplacementMapElement>(null);
  const displacementMapBBoxRef = useRef<SVGFEDisplacementMapElement>(null);
  const specularImageBoxRef = useRef<SVGFEImageElement>(null);
  const specularAlphaBoxRef = useRef<SVGFEFuncAElement>(null);
  const cloneInnerBoxRef = useRef<HTMLDivElement>(null);

  // Physics state
  const springs = useRef<PhysicsState>({
    scale: new Spring(0.8, 300, 25),
    opacity: new Spring(0, 300, 25),
    shadowOffsetX: new Spring(0, 300, 25),
    shadowOffsetY: new Spring(4, 300, 25),
    shadowBlur: new Spring(12, 300, 25),
    shadowAlpha: new Spring(0.15, 300, 25)
  }).current;
  const rafId = useRef<number | null>(null);

  // Setup Feature Detection and Resize Listener
  useEffect(() => {
    const supported = detectBackdropFilterSupport();
    setBackdropSupported(supported);
    setUseBackdrop(supported);

    const handleResize = () => {
      if (drawerRef.current) {
        setDrawerSize({
          w: drawerRef.current.clientWidth,
          h: drawerRef.current.clientHeight,
        });
      }
    };
    // Initial size after mount
    setTimeout(handleResize, 50); // slight delay to ensure layout is done
    window.addEventListener("resize", handleResize);
    
    // Set initial box pos accurately after mount
    setBoxPos({
      x: window.innerWidth / 2 - 25,
      y: window.innerHeight / 2 - 25
    });

    return () => window.removeEventListener("resize", handleResize);
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
    if (!useBackdrop && cloneInnerRef.current && drawerRef.current) {
      const rect = drawerRef.current.getBoundingClientRect();
      cloneInnerRef.current.style.width = `${window.innerWidth}px`;
      cloneInnerRef.current.style.height = `${window.innerHeight}px`;
      cloneInnerRef.current.style.transform = `translate(${-rect.left}px, ${-rect.top}px)`;
    }
    if (!useBackdrop && cloneInnerBoxRef.current) {
      cloneInnerBoxRef.current.style.width = `${window.innerWidth}px`;
      cloneInnerBoxRef.current.style.height = `${window.innerHeight}px`;
      cloneInnerBoxRef.current.style.transform = `translate(${-boxPos.x}px, ${-boxPos.y}px)`;
    }
  }, [useBackdrop, drawerSize, isOpen, boxPos]);

  // Heavy Computation Isolation bounded by parameters
  useEffect(() => {
    if (!filterBlurRef.current || drawerSize.w <= 0 || drawerSize.h <= 0) return;

    const surfaceFn = SurfaceEquations[surfaceType];
    if (!surfaceFn) return;


    const dpr = window.devicePixelRatio || 1;
    const physW = Math.round(drawerSize.w * dpr);
    const physH = Math.round(drawerSize.h * dpr);
    const physRadius = drawerRadius * dpr;
    const physBezelWidth = bezelWidth * dpr;

    const precomputed = calculateDisplacementMap1D(
      glassThickness,
      bezelWidth, // keep logical for lookup scaling
      surfaceFn,
      DEFAULTS.refractiveIndex
    );
    const maxDisp = Math.max(...precomputed.map(Math.abs));

    const dispData = calculateDisplacementMap2D(
      physW, physH, 
      physW, physH, 
      physRadius, physBezelWidth, maxDisp || 1, precomputed
    );
    
    const specData = calculateSpecularHighlight(physW, physH, physRadius, dpr);

    const dispUrl = imageDataToDataURL(dispData);
    const specUrl = imageDataToDataURL(specData);

    // Update filter elements via ref to avoid state churn
    displacementImageRef.current?.setAttribute("href", dispUrl);
    displacementImageRef.current?.setAttribute("width", String(drawerSize.w));
    displacementImageRef.current?.setAttribute("height", String(drawerSize.h));
    specularImageRef.current?.setAttribute("href", specUrl);
    specularImageRef.current?.setAttribute("width", String(drawerSize.w));
    specularImageRef.current?.setAttribute("height", String(drawerSize.h));
    
    const baseScale = maxDisp * refractionScale;
    const caFactor = chromaticAberration * 0.05; // Make the effect proportional and pronounced
    displacementMapRRef.current?.setAttribute("scale", String(baseScale * (1 + caFactor)));
    displacementMapGRef.current?.setAttribute("scale", String(baseScale));
    displacementMapBRef.current?.setAttribute("scale", String(baseScale * (1 - caFactor)));

    specularAlphaRef.current?.setAttribute("slope", String(specularOpacity));
    filterBlurRef.current?.setAttribute("stdDeviation", String(blur));

    // --- Box Computation ---
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
    
    displacementMapRBoxRef.current?.setAttribute("scale", String(baseScale * (1 + caFactor)));
    displacementMapGBoxRef.current?.setAttribute("scale", String(baseScale));
    displacementMapBBoxRef.current?.setAttribute("scale", String(baseScale * (1 - caFactor)));
    
    specularAlphaBoxRef.current?.setAttribute("slope", String(specularOpacity));
    filterBlurBoxRef.current?.setAttribute("stdDeviation", String(blur));

  }, [surfaceType, bezelWidth, drawerRadius, glassThickness, refractionScale, specularOpacity, blur, chromaticAberration, drawerSize]);

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

      if (drawerRef.current) {
        drawerRef.current.style.transform = `scale(${scale})`;
        drawerRef.current.style.opacity = `${opacity}`;
        drawerRef.current.style.pointerEvents = opacity > 0.5 ? "auto" : "none";

        const innerShadow = drawerRef.current.querySelector(".drawer-inner-shadow") as HTMLElement;
        if (innerShadow) {
          const insetAlpha = sAl * 0.6;
          innerShadow.style.boxShadow = `
            ${sOx}px ${sOy}px ${sBl}px rgba(0, 0, 0, ${sAl}),
            inset ${sOx * 0.3}px ${sOy * 0.4}px 16px rgba(0, 0, 0, ${insetAlpha}),
            inset ${-sOx * 0.3}px ${-sOy * 0.4}px 16px rgba(255, 255, 255, ${insetAlpha * 0.8})
          `;
        }
      }

      // Sync clone wrapper position for filter
      if (!useBackdrop && cloneInnerRef.current && drawerRef.current) {
        const rect = drawerRef.current.getBoundingClientRect();
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

  return (
    <>
      <div 
        ref={drawerRef}
        className={`liquid-glass-drawer ${useBackdrop ? "use-backdrop-filter" : ""} ${className}`} 
        style={{ opacity: 0, pointerEvents: "none", borderRadius: drawerRadius }}
      >
      {/* Fallback structure */}
      <div className="drawer-content-clone">
        <div ref={cloneInnerRef} className="drawer-content-inner">
          {children}
        </div>
      </div>

      <svg className="drawer-filter-svg" aria-hidden="true" style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="liquidGlassFilterDrawer" x="0" y="0" width={drawerSize.w} height={drawerSize.h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur ref={filterBlurRef} in="SourceGraphic" stdDeviation={blur} result="blurred" />
            <feImage ref={displacementImageRef} href="" x="0" y="0" width={drawerSize.w} height={drawerSize.h} result="raw_displacement_map" preserveAspectRatio="none" />
            
            {/* Blur the displacement map slightly to eliminate 8-bit color quantization stepping */}
            <feGaussianBlur in="raw_displacement_map" stdDeviation="1.5" result="displacement_map" />
            
            <feColorMatrix in="blurred" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red_layer" />
            <feColorMatrix in="blurred" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green_layer" />
            <feColorMatrix in="blurred" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue_layer" />
            
            <feDisplacementMap ref={displacementMapRRef} in="red_layer" in2="displacement_map" scale={50} xChannelSelector="R" yChannelSelector="G" result="red_displaced" />
            <feDisplacementMap ref={displacementMapGRef} in="green_layer" in2="displacement_map" scale={50} xChannelSelector="R" yChannelSelector="G" result="green_displaced" />
            <feDisplacementMap ref={displacementMapBRef} in="blue_layer" in2="displacement_map" scale={50} xChannelSelector="R" yChannelSelector="G" result="blue_displaced" />

            <feBlend in="red_displaced" in2="green_displaced" mode="lighten" result="rg" />
            <feBlend in="rg" in2="blue_displaced" mode="lighten" result="displaced_aberrated" />
            
            <feColorMatrix in="displaced_aberrated" type="saturate" values="1.3" result="displaced_saturated" />
            <feImage ref={specularImageRef} href="" x="0" y="0" width={drawerSize.w} height={drawerSize.h} result="specular_layer" preserveAspectRatio="none" />
            <feComponentTransfer in="specular_layer" result="specular_faded">
              <feFuncA ref={specularAlphaRef} type="linear" slope={specularOpacity} />
            </feComponentTransfer>
            <feBlend in="specular_faded" in2="displaced_saturated" mode="screen" />
          </filter>
          <filter id="liquidGlassFilterBox" x="0" y="0" width="200" height="200" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur ref={filterBlurBoxRef} in="SourceGraphic" stdDeviation={blur} result="blurred" />
            <feImage ref={displacementImageBoxRef} href="" x="0" y="0" width="200" height="200" result="raw_displacement_map_box" preserveAspectRatio="none" />
            
            <feGaussianBlur in="raw_displacement_map_box" stdDeviation="1.5" result="displacement_map_box" />
            
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

      <div className="drawer-inner-shadow" />
    </div>

    {/* Draggable 50x50 box */}
    <div
      className={`draggable-liquid-box ${useBackdrop ? "use-backdrop-filter" : ""}`}
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
        <div ref={cloneInnerBoxRef} className="box-content-inner">
          {children}
        </div>
      </div>
      <div className="drawer-inner-shadow" />
    </div>

    {/* Live Parameter Controls */}
    <div 
      className="controls-panel"
      style={{
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
        transform: isOpen ? "translateY(0)" : "translateY(20px)",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
          <div className="controls-header">
            <span className="controls-header-text">Parameters</span>
            <span className="controls-header-line" />
          </div>

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

          <div className="control-row">
            <label className="control-label">Render Mode</label>
            <div className="mode-toggle">
              <div 
                className={`mode-toggle-switch ${useBackdrop ? "active" : ""}`} 
                onClick={() => setUseBackdrop(!useBackdrop)} 
              />
              <span className="mode-toggle-value">{useBackdrop ? "Backdrop-filter" : "Clone (Fallback)"}</span>
              {useBackdrop && !backdropSupported && <span style={{ fontSize: 10, color: "#f56565" }}>⚠ Not supported</span>}
            </div>
          </div>

          <div className="control-row">
            <label className="control-label">Bezel Width</label>
            <span className="control-value">{Math.round(bezelWidth)}</span>
            <input type="range" className="control-slider" min={5} max={100} value={bezelWidth} onChange={(e) => setBezelWidth(Number(e.target.value))} />
          </div>
          <div className="control-row">
            <label className="control-label">Drawer Radius</label>
            <span className="control-value">{Math.round(drawerRadius)}</span>
            <input type="range" className="control-slider" min={0} max={500} value={drawerRadius} onChange={(e) => setDrawerRadius(Number(e.target.value))} />
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
          <div className="control-row">
            <label className="control-label">Chromatic Aberration</label>
            <span className="control-value">{chromaticAberration.toFixed(1)}</span>
            <input type="range" className="control-slider" min={0} max={50} step={1} value={chromaticAberration} onChange={(e) => setChromaticAberration(Number(e.target.value))} />
          </div>
        </div>
    </>
  );
};
