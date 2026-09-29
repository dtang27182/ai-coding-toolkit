export type RichDiffReferences = {
  enrichedPatch: string;
  sysDataflow: string;
  implDataflow: string;
};

export function richDiffReferences(value: unknown): RichDiffReferences {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rich Diff must be an object with enrichedPatch, sysDataflow, and implDataflow paths.");
  }
  const fields = value as Record<string, unknown>;
  if (
    Object.keys(fields).length !== 3 ||
    typeof fields.enrichedPatch !== "string" ||
    typeof fields.sysDataflow !== "string" ||
    typeof fields.implDataflow !== "string" ||
    !fields.enrichedPatch.endsWith(".enriched-patch.json") ||
    !fields.sysDataflow.endsWith(".cr.sys-dataflow.json") ||
    !fields.implDataflow.endsWith(".cr.impl-dataflow.json")
  ) {
    throw new Error("Rich Diff must contain only enrichedPatch, sysDataflow, and implDataflow JSON paths.");
  }
  for (const reference of [fields.enrichedPatch, fields.sysDataflow, fields.implDataflow]) {
    if (!reference.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(reference)) {
      throw new Error("Rich Diff paths must be absolute.");
    }
  }
  return { enrichedPatch: fields.enrichedPatch, sysDataflow: fields.sysDataflow, implDataflow: fields.implDataflow };
}
