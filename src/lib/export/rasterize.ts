/**
 * Client-side rasterization of a standalone plan SVG.
 * Dynamic scale + blank-canvas detection for iOS Safari safety.
 */

import { EXPORT_PX_PER_IN } from "@/lib/export/constants";
import {
  computeRasterSize,
  type RasterPreset,
  type RasterSize,
} from "@/lib/export/raster-scale";

export { EXPORT_PX_PER_IN };
export type { RasterPreset, RasterSize };

export type RasterFormat = "png" | "jpg";

export class BlankRasterError extends Error {
  constructor(message = "The image came out blank. Try a smaller resolution.") {
    super(message);
    this.name = "BlankRasterError";
  }
}

/**
 * Draw SVG string into a canvas and return a Blob.
 * Verifies the canvas is not blank; retries at smaller scales if needed.
 */
export async function rasterizePlanSvg(
  svgString: string,
  format: RasterFormat,
  preset: RasterPreset = "print",
): Promise<{ blob: Blob; size: RasterSize }> {
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const planWIn = img.naturalWidth / EXPORT_PX_PER_IN;
    const planHIn = img.naturalHeight / EXPORT_PX_PER_IN;

    let size = computeRasterSize(planWIn, planHIn, preset, EXPORT_PX_PER_IN);
    let attempt = 0;
    const maxAttempts = 4;

    while (attempt < maxAttempts) {
      attempt += 1;
      const canvas = document.createElement("canvas");
      canvas.width = size.widthPx;
      canvas.height = size.heightPx;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not create a drawing surface on this device.");
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.widthPx, size.heightPx);
      ctx.drawImage(img, 0, 0, size.widthPx, size.heightPx);

      if (!isCanvasBlank(ctx, size.widthPx, size.heightPx)) {
        const mime = format === "png" ? "image/png" : "image/jpeg";
        const quality = format === "jpg" ? 0.92 : undefined;
        const out = await canvasToBlob(canvas, mime, quality);
        return { blob: out, size };
      }

      // Fall back to a smaller scale automatically
      const nextW = Math.max(1, Math.floor(size.widthPx * 0.6));
      const nextH = Math.max(1, Math.floor(size.heightPx * 0.6));
      if (nextW === size.widthPx && nextH === size.heightPx) break;
      size = {
        widthPx: nextW,
        heightPx: nextH,
        pxPerIn: nextW / planWIn,
        scaleFromSvg: nextW / planWIn / EXPORT_PX_PER_IN,
        clamped: true,
      };
    }

    throw new BlankRasterError(
      "Could not create the image on this device. Try the Web or MLS preset, or export SVG instead.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Sample a grid of pixels. A successful plan always has dark ink (walls/labels).
 * An all-near-white canvas after drawImage means Safari blanked the surface.
 */
export function isCanvasBlank(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  if (width < 1 || height < 1) return true;
  const sample = Math.min(24, width, height);
  let dark = 0;
  for (let iy = 0; iy < sample; iy += 1) {
    for (let ix = 0; ix < sample; ix += 1) {
      const x = Math.min(width - 1, Math.floor(((ix + 0.5) / sample) * width));
      const y = Math.min(height - 1, Math.floor(((iy + 0.5) / sample) * height));
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      if ((a ?? 0) < 8) continue;
      // Near-white paper vs ink
      if ((r ?? 255) < 250 || (g ?? 255) < 250 || (b ?? 255) < 250) {
        dark += 1;
        if (dark >= 3) return false;
      }
    }
  }
  return true;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Could not load the plan image for export."));
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not create the image file."));
        } else {
          resolve(blob);
        }
      },
      mime,
      quality,
    );
  });
}
