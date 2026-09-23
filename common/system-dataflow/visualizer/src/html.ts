import type { Selection } from "./types.ts";

export function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function selectionKey(value: Selection | undefined): string {
  if (value === undefined) {
    return "";
  } else if (value.type === "node") {
    return `node:${value.name}`;
  } else {
    return `relationship:${value.id}`;
  }
}
