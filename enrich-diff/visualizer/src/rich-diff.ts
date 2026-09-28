export type RichDiffReferences = {
  enrichedPatch: string;
  sysDataflow: string;
};

export function richDiffReferences(value: unknown): RichDiffReferences {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rich Diff must be an object with enrichedPatch and sysDataflow paths.");
  }
  const fields = value as Record<string, unknown>;
  if (
    Object.keys(fields).length !== 2 ||
    typeof fields.enrichedPatch !== "string" ||
    typeof fields.sysDataflow !== "string" ||
    !fields.enrichedPatch.endsWith(".enriched-patch.json") ||
    !fields.sysDataflow.endsWith(".cr.sys-dataflow.json")
  ) {
    throw new Error("Rich Diff must contain only enrichedPatch and sysDataflow JSON paths.");
  }
  for (const reference of [fields.enrichedPatch, fields.sysDataflow]) {
    if (!reference.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(reference)) {
      throw new Error("Rich Diff paths must be absolute.");
    }
  }
  return { enrichedPatch: fields.enrichedPatch, sysDataflow: fields.sysDataflow };
}
