export type HldManifest = {
  hld: string;
  sysDataflow: string;
  implDataflow: string;
};

export function hldManifestReferences(value: unknown): HldManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("HLD manifest must contain hld, sysDataflow, and implDataflow paths.");
  }
  const fields = value as Record<string, unknown>;
  if (
    typeof fields.hld !== "string" || !fields.hld.endsWith(".hld.md") ||
    typeof fields.sysDataflow !== "string" || !fields.sysDataflow.endsWith(".sys-dataflow.json") ||
    typeof fields.implDataflow !== "string" || !fields.implDataflow.endsWith(".impl-dataflow.json")
  ) {
    throw new Error("HLD manifest must contain hld, sysDataflow, and implDataflow paths.");
  }
  for (const reference of [fields.hld, fields.sysDataflow, fields.implDataflow]) {
    if (!reference.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(reference)) {
      throw new Error("HLD manifest paths must be absolute.");
    }
  }
  return { hld: fields.hld, sysDataflow: fields.sysDataflow, implDataflow: fields.implDataflow };
}
