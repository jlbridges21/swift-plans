export function slugifyFilenamePart(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "plan"
  );
}

export function exportFilename(
  projectName: string,
  floorName: string,
  ext: "svg" | "png" | "jpg" | "pdf",
): string {
  return `${slugifyFilenamePart(projectName)}-${slugifyFilenamePart(floorName)}.${ext}`;
}
