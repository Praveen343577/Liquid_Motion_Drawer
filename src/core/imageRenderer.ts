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