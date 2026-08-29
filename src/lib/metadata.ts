import exifr from "exifr";

const EDITING_SOFTWARE_SIGNATURES = [
  "photoshop",
  "gimp",
  "affinity",
  "lightroom",
  "pixlr",
  "canva",
  "snapseed",
];

export async function analyzeImageMetadata(buffer: Buffer): Promise<string[]> {
  const flags: string[] = [];

  try {
    const data = await exifr.parse(buffer, { pick: ["Software", "ModifyDate", "CreateDate", "DateTimeOriginal"] });

    if (!data) {
      return flags;
    }

    if (data.Software) {
      const software = String(data.Software).toLowerCase();
      if (EDITING_SOFTWARE_SIGNATURES.some((sig) => software.includes(sig))) {
        flags.push(`Image metadata references editing software: "${data.Software}".`);
      }
    }

    if (data.ModifyDate && data.CreateDate) {
      const modified = new Date(data.ModifyDate);
      const created = new Date(data.CreateDate);
      if (!isNaN(modified.getTime()) && !isNaN(created.getTime()) && modified.getTime() - created.getTime() > 60000) {
        flags.push("Image modification timestamp differs from creation timestamp by more than one minute.");
      }
    }
  } catch {
    // Unreadable or stripped metadata is common for scans/screenshots and is not itself a tampering signal.
  }

  return flags;
}
