// ── Surface equations (verbatim from original demo) ──────────
export const SurfaceEquations: Record<string, (x: number) => number> = {
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
export function calculateDisplacementMap1D(
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

export function calculateDisplacementMap2D(
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

export function calculateSpecularHighlight(oW: number, oH: number, radius: number) {
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

export function imageDataToDataURL(imageData: ImageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}
