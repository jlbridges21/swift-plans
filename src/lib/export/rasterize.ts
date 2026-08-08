/**
 * Client-side rasterization of a standalone plan SVG.
 * Scale: EXPORT_PX_PER_IN (8 px/inch) from the SVG's intrinsic width/height.
 */

import { EXPORT_PX_PER_IN } from "@/lib/export/constants";

export { EXPORT_PX_PER_IN };

export type RasterFormat = "png" | "jpg";

/**
 * Draw SVG string into a canvas and return a Blob.
 * Loads the embedded @font-face via a Blob URL (more reliable than huge data URLs).
 */
export async function rasterizePlanSvg(
  svgString: string,
  format: RasterFormat,
  scale = 1,
): Promise<Blob> {
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create drawing surface.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const quality = format === "jpg" ? 0.92 : undefined;
    const out = await canvasToBlob(canvas, mime, quality);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load plan image."));
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
        if (!blob) reject(new Error("Could not create image file."));
        else resolve(blob);
      },
      mime,
      quality,
    );
  });
}
