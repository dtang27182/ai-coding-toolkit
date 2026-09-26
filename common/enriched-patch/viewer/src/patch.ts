import type { DiffFile } from "./types.ts";

function decodeGitPath(value: string): string {
  let decoded = value;
  if (!value.startsWith('"')) {
    decoded = value;
  } else {
    decoded = "";
    for (let index = 1; index < value.length - 1; index += 1) {
      if (value[index] !== "\\") {
        decoded += value[index];
      } else {
        index += 1;
        const escape = value[index];
        if (escape === "n") {
          decoded += "\n";
        } else if (escape === "t") {
          decoded += "\t";
        } else if (escape === "r") {
          decoded += "\r";
        } else if (escape === "\\" || escape === '"') {
          decoded += escape;
        } else if (/[0-7]/.test(escape)) {
          let octal = escape;
          while (octal.length < 3 && /[0-7]/.test(value[index + 1] ?? "")) {
            index += 1;
            octal += value[index];
          }
          decoded += String.fromCharCode(Number.parseInt(octal, 8));
        } else {
          decoded += escape;
        }
      }
    }
  }
  return decoded;
}

function headerPath(value: string): string | null {
  const token = value.startsWith('"') ? value : value.split("\t", 1)[0];
  const decoded = decodeGitPath(token);
  if (decoded === "/dev/null") {
    return null;
  } else if (decoded.startsWith("a/") || decoded.startsWith("b/")) {
    return decoded.slice(2);
  } else {
    return decoded;
  }
}

function parseToken(value: string, start: number): { value: string; next: number } {
  if (value[start] === '"') {
    let index = start + 1;
    while (index < value.length && value[index] !== '"') {
      index += value[index] === "\\" ? 2 : 1;
    }
    return { value: decodeGitPath(value.slice(start, index + 1)), next: index + 1 };
  } else {
    const end = value.indexOf(" ", start);
    return end === -1
      ? { value: value.slice(start), next: value.length }
      : { value: value.slice(start, end), next: end };
  }
}

function diffHeaderPaths(line: string): { oldPath: string | null; newPath: string | null } {
  const value = line.slice("diff --git ".length);
  const oldToken = parseToken(value, 0);
  let next = oldToken.next;
  while (value[next] === " ") next += 1;
  const newToken = parseToken(value, next);
  return { oldPath: headerPath(oldToken.value), newPath: headerPath(newToken.value) };
}

export function parsePatch(patch: string): DiffFile[] {
  const lines = patch.replaceAll("\r\n", "\n").split("\n");
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const paths = diffHeaderPaths(line);
      file = {
        oldPath: paths.oldPath,
        newPath: paths.newPath,
        path: paths.newPath ?? paths.oldPath ?? "",
        binary: false,
        rows: [],
        added: 0,
        removed: 0,
      };
      files.push(file);
      inHunk = false;
    } else if (file !== undefined && line.startsWith("new file mode ")) {
      file.oldPath = null;
    } else if (file !== undefined && line.startsWith("deleted file mode ")) {
      file.newPath = null;
      file.path = file.oldPath ?? "";
    } else if (file !== undefined && line.startsWith("--- ")) {
      file.oldPath = headerPath(line.slice(4));
    } else if (file !== undefined && line.startsWith("+++ ")) {
      file.newPath = headerPath(line.slice(4));
      file.path = file.newPath ?? file.oldPath ?? "";
    } else if (file !== undefined && (line.startsWith("Binary files ") || line === "GIT binary patch")) {
      file.binary = true;
      inHunk = false;
    } else if (file !== undefined && line.startsWith("@@ ")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match !== null) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
        inHunk = true;
      }
    } else if (file !== undefined && inHunk && line.startsWith("+")) {
      file.rows.push({ kind: "add", text: line.slice(1), newLine });
      file.added += 1;
      newLine += 1;
    } else if (file !== undefined && inHunk && line.startsWith("-")) {
      file.rows.push({ kind: "delete", text: line.slice(1), oldLine });
      file.removed += 1;
      oldLine += 1;
    } else if (file !== undefined && inHunk && line.startsWith(" ")) {
      file.rows.push({ kind: "context", text: line.slice(1), oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    } else if (file !== undefined && inHunk && line === "\\ No newline at end of file") {
      // The marker describes the preceding row and is not source content.
    }
  }

  return files;
}

export function lineIsInRange(line: number | undefined, range: [number, number] | null): boolean {
  return line !== undefined && range !== null && line >= range[0] && line <= range[1];
}

export function firstChangedLine(file: DiffFile): { side: "old" | "new"; line: number } | undefined {
  const row = file.rows.find((candidate) => candidate.kind === "add" || candidate.kind === "delete");
  let target;
  if (row?.kind === "add") {
    target = { side: "new" as const, line: row.newLine! };
  } else if (row?.kind === "delete") {
    target = { side: "old" as const, line: row.oldLine! };
  }
  return target;
}
