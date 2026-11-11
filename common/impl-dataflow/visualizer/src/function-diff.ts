import type { FunctionNode, FunctionDiffLocation, LineRange } from "../../types.ts";

function inRange(line: number | undefined, range: LineRange | null): boolean {
  return line !== undefined && range !== null && range[0] <= line && line <= range[1];
}

function inLocation(oldLine: number | undefined, newLine: number | undefined, locations: FunctionDiffLocation[]): boolean {
  return locations.some((location) => inRange(oldLine, location.oldLines) || inRange(newLine, location.newLines));
}

export function functionDiffLines(node: FunctionNode, hunk: { file: string; patch: string }): string[] {
  const locations = (node.locations ?? []).filter((location) => location.file === hunk.file);
  const [header, ...lines] = hunk.patch.replaceAll("\r\n", "\n").replace(/\n$/, "").split("\n");
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  if (locations.length === 0 || match === null) return [];

  let oldLine = Number(match[1]);
  let newLine = Number(match[2]);
  const rows = lines.filter((line) => line.startsWith(" ") || line.startsWith("-") || line.startsWith("+")).map((line) => {
    const sign = line[0];
    const row = {
      text: line,
      oldLine: sign === "+" ? undefined : oldLine,
      newLine: sign === "-" ? undefined : newLine,
    };
    if (sign !== "+") oldLine += 1;
    if (sign !== "-") newLine += 1;
    return row;
  });
  const changed = rows.map((row) => inLocation(row.oldLine, row.newLine, locations) &&
    (row.text.startsWith("-") && (node.changes ?? []).some((change) => inRange(row.oldLine, change.oldLines)) ||
      row.text.startsWith("+") && (node.changes ?? []).some((change) => inRange(row.newLine, change.newLines))));
  const selected = [...changed];
  for (let index = 0; index < rows.length; index += 1) {
    if (changed[index]) {
      for (let nearby = Math.max(0, index - 3); nearby <= Math.min(rows.length - 1, index + 3); nearby += 1) {
        if (rows[nearby].text.startsWith(" ") && inLocation(rows[nearby].oldLine, rows[nearby].newLine, locations)) {
          selected[nearby] = true;
        }
      }
    }
  }
  const result: string[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (selected[index]) {
      if (result.length > 0 && !selected[index - 1]) result.push(" …");
      result.push(rows[index].text);
    }
  }
  return result;
}
