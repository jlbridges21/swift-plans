/**
 * Trigger a file download / share that works on desktop and iPhone Safari.
 */

export async function downloadBlob(
  blob: Blob,
  filename: string,
): Promise<"download" | "share" | "open"> {
  const file = new File([blob], filename, { type: blob.type });

  // iOS Safari: Web Share with files is the reliable path
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return "share";
    } catch (err) {
      // User cancel — fall through to anchor download
      if (err instanceof DOMException && err.name === "AbortError") {
        return "share";
      }
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "download";
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }
}

export function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  return downloadBlob(blob, filename);
}
