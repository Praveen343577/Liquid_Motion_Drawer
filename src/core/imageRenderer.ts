/**
 * imageRenderer.ts
 *
 * Converts the raw ImageData produced by liquidMath.ts into something a
 * browser can actually bind to `<feImage href="...">`: a Blob-backed Object
 * URL, instead of the vanilla demo's `canvas.toDataURL()` base64 string.
 *
 * Blueprint A.3: a base64 data URL costs a full string encode on every
 * regenerate and runs ~33% larger than the source bytes; an Object URL is
 * just a reference to memory the browser already holds. That matters here
 * specifically because useLiquidMaps.ts regenerates these maps whenever
 * width/height/thickness/bezel/refraction change — every regenerate that
 * used toDataURL would re-pay the encoding cost for no benefit React can
 * see, since the string itself isn't part of any diffed state.
 *
 * Everything in this file is DOM/Canvas-dependent and must only run
 * client-side. Frameworks that server-render (Next.js, Remix, etc.) should
 * only call these from an effect, never during render — imageDataToBlob's
 * `typeof document` guard exists as a safety net, not a substitute for that.
 */

/**
 * Renders ImageData to a PNG Blob. Prefers OffscreenCanvas — it's natively
 * Promise-based and can run off the main thread — and falls back to a
 * regular <canvas> + toBlob for environments without it.
 */
export function imageDataToBlob(imageData: ImageData): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return Promise.reject(
        new Error(
          "imageRenderer: failed to acquire a 2D context from OffscreenCanvas",
        ),
      );
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
  }

  if (typeof document === "undefined") {
    return Promise.reject(
      new Error(
        "imageRenderer: no OffscreenCanvas and no document available — " +
          "this must run in a browser environment, not during SSR.",
      ),
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(
      new Error("imageRenderer: failed to acquire a 2D context from canvas"),
    );
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("imageRenderer: canvas.toBlob returned null"));
      }
    }, "image/png");
  });
}

/**
 * Renders ImageData straight to an Object URL — the value that actually
 * gets bound to `<feImage href>`. The caller owns this URL's lifetime and
 * MUST pass it to revokeObjectURL when it's replaced or no longer needed
 * (see useLiquidMaps.ts's effect cleanup) — an un-revoked Object URL holds
 * its backing Blob in memory for the life of the document.
 */
export async function imageDataToObjectURL(imageData: ImageData): Promise<string> {
  const blob = await imageDataToBlob(imageData);
  return URL.createObjectURL(blob);
}

/**
 * Revokes a previously created Object URL. Safe to call with null/undefined
 * so cleanup code (e.g. "revoke the previous URL, if any") doesn't need to
 * guard every call site itself.
 */
export function revokeObjectURL(url: string | null | undefined): void {
  if (!url) return;
  URL.revokeObjectURL(url);
}