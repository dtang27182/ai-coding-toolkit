import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import * as ts from "typescript/unstable/ast";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API as TypeScriptAPI } from "typescript/unstable/sync";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(await readFile(path.join(scriptDirectory, "diff-index.schema.json"), "utf8"));
const validateSchema = new Ajv2020({ allErrors: true }).compile(schema);

function decodeGitPath(value) {
  if (!value.startsWith('"')) {
    return value;
  }

  let result = "";
  for (let index = 1; index < value.length - 1; index += 1) {
    if (value[index] !== "\\") {
      result += value[index];
    } else if (/[0-7]/.test(value[index + 1] ?? "")) {
      const match = value.slice(index + 1).match(/^[0-7]{1,3}/);
      result += String.fromCharCode(Number.parseInt(match[0], 8));
      index += match[0].length;
    } else {
      const escaped = value[index + 1];
      if (escaped === "n") {
        result += "\n";
      } else if (escaped === "r") {
        result += "\r";
      } else if (escaped === "t") {
        result += "\t";
      } else {
        result += escaped;
      }
      index += 1;
    }
  }
  return result;
}

function parseToken(value, start) {
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

function stripSidePrefix(value) {
  if (value === "/dev/null") {
    return null;
  } else if (value.startsWith("a/") || value.startsWith("b/")) {
    return value.slice(2);
  } else {
    return value;
  }
}

function diffHeaderPaths(line) {
  const value = line.slice("diff --git ".length);
  const oldToken = parseToken(value, 0);
  let next = oldToken.next;
  while (value[next] === " ") next += 1;
  const newToken = parseToken(value, next);
  return {
    oldPath: stripSidePrefix(oldToken.value),
    newPath: stripSidePrefix(newToken.value),
  };
}

function fileHeaderPath(line) {
  const value = line.slice(4).split("\t", 1)[0];
  return stripSidePrefix(decodeGitPath(value));
}

function parseHunkHeader(line) {
  const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (match === null) {
    throw new Error(`Invalid hunk header: ${line}`);
  }
  return {
    oldStart: Number(match[1]),
    oldCount: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newCount: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function parseFileSection(lines) {
  const headerPaths = diffHeaderPaths(lines[0]);
  const file = {
    oldPath: headerPaths.oldPath,
    newPath: headerPaths.newPath,
    binary: false,
    rows: [],
  };
  let oldLine;
  let newLine;
  let remainingOld = 0;
  let remainingNew = 0;
  let inHunk = false;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!inHunk && line.startsWith("--- ")) {
      file.oldPath = fileHeaderPath(line);
    } else if (!inHunk && line.startsWith("+++ ")) {
      file.newPath = fileHeaderPath(line);
    } else if (!inHunk && (line.startsWith("Binary files ") || line === "GIT binary patch")) {
      file.binary = true;
    } else if (line.startsWith("@@ ")) {
      if (inHunk && (remainingOld !== 0 || remainingNew !== 0)) {
        throw new Error(`Hunk ended before its declared line counts in ${file.newPath ?? file.oldPath}.`);
      }
      const hunk = parseHunkHeader(line);
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      remainingOld = hunk.oldCount;
      remainingNew = hunk.newCount;
      inHunk = true;
    } else if (inHunk && line.startsWith("\\ No newline at end of file")) {
      // The preceding row already contains the source text.
    } else if (inHunk && line.startsWith(" ")) {
      file.rows.push({ kind: "context", text: line.slice(1), oldLine, newLine });
      oldLine += 1;
      newLine += 1;
      remainingOld -= 1;
      remainingNew -= 1;
    } else if (inHunk && line.startsWith("-")) {
      file.rows.push({ kind: "delete", text: line.slice(1), oldLine });
      oldLine += 1;
      remainingOld -= 1;
    } else if (inHunk && line.startsWith("+")) {
      file.rows.push({ kind: "add", text: line.slice(1), newLine });
      newLine += 1;
      remainingNew -= 1;
    } else if (inHunk && line === "" && remainingOld === 0 && remainingNew === 0) {
      inHunk = false;
    } else if (inHunk) {
      throw new Error(`Invalid hunk line in ${file.newPath ?? file.oldPath}: ${line}`);
    }

    if (remainingOld < 0 || remainingNew < 0) {
      throw new Error(`Hunk exceeds its declared line counts in ${file.newPath ?? file.oldPath}.`);
    }
  }

  if (inHunk && (remainingOld !== 0 || remainingNew !== 0)) {
    throw new Error(`Hunk ended before its declared line counts in ${file.newPath ?? file.oldPath}.`);
  }
  return file;
}

export function parsePatch(patch) {
  const lines = patch.replaceAll("\r\n", "\n").split("\n");
  const sections = [];
  let sectionStart;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith("diff --git ")) {
      if (sectionStart !== undefined) sections.push(lines.slice(sectionStart, index));
      sectionStart = index;
    }
  }
  if (sectionStart !== undefined) sections.push(lines.slice(sectionStart));
  return sections.map(parseFileSection);
}

function sourceImage(file, side) {
  const lines = [];
  let expectedLine = 1;
  for (const row of file.rows) {
    const lineNumber = side === "old" ? row.oldLine : row.newLine;
    if (lineNumber !== undefined) {
      if (lineNumber !== expectedLine) {
        throw new Error(`${side} image for ${file.newPath ?? file.oldPath} is not full-context at line ${expectedLine}.`);
      }
      lines.push(row.text);
      expectedLine += 1;
    }
  }
  return lines.join("\n");
}

function supportedSource(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if ([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"].includes(extension)) {
    return true;
  } else {
    return false;
  }
}

function declarationRange(node, sourceFile) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const endPosition = Math.max(node.getStart(sourceFile), node.end - 1);
  const end = sourceFile.getLineAndCharacterOfPosition(endPosition).line + 1;
  return [start, end];
}

function methodName(member, sourceFile) {
  if (ts.isConstructorDeclaration(member)) {
    return "constructor";
  } else if (member.name !== undefined) {
    return member.name.getText(sourceFile);
  } else {
    return undefined;
  }
}

function isFunctionValue(node) {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function declarations(sourceFile) {
  const values = [];
  for (const statement of sourceFile.statements) {
    if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      const className = statement.name.text;
      const classKey = `class:${className}`;
      values.push({ key: classKey, kind: "class", name: className, range: declarationRange(statement, sourceFile) });
      for (const member of statement.members) {
        if (
          ts.isMethodDeclaration(member) ||
          ts.isGetAccessorDeclaration(member) ||
          ts.isSetAccessorDeclaration(member) ||
          ts.isConstructorDeclaration(member) ||
          (ts.isPropertyDeclaration(member) && isFunctionValue(member.initializer))
        ) {
          const name = methodName(member, sourceFile);
          if (name !== undefined) {
            values.push({
              key: `${classKey}:method:${name}`,
              kind: "method",
              name,
              parentKey: classKey,
              range: declarationRange(member, sourceFile),
            });
          }
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      values.push({
        key: `method:${statement.name.text}`,
        kind: "method",
        name: statement.name.text,
        range: declarationRange(statement, sourceFile),
      });
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && isFunctionValue(declaration.initializer)) {
          values.push({
            key: `method:${declaration.name.text}`,
            kind: "method",
            name: declaration.name.text,
            range: declarationRange(declaration, sourceFile),
          });
        }
      }
    }
  }
  return values;
}

function populateDeclarations(files) {
  const virtualFiles = {};
  const openFiles = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const fileName = file.newPath ?? file.oldPath;
    if (!file.binary && fileName !== null && supportedSource(fileName)) {
      const extension = path.extname(fileName);
      file.oldVirtualPath = `/diff-index/file-${index}/old${extension}`;
      file.newVirtualPath = `/diff-index/file-${index}/new${extension}`;
      virtualFiles[file.oldVirtualPath] = file.oldSource;
      virtualFiles[file.newVirtualPath] = file.newSource;
      openFiles.push(file.oldVirtualPath, file.newVirtualPath);
    }
  }

  if (openFiles.length > 0) {
    const api = new TypeScriptAPI({ cwd: "/", fs: createVirtualFileSystem(virtualFiles) });
    try {
      const snapshot = api.updateSnapshot({ openFiles });
      try {
        for (const file of files) {
          if (file.oldVirtualPath !== undefined) {
            const oldProject = snapshot.getDefaultProjectForFile(file.oldVirtualPath);
            const newProject = snapshot.getDefaultProjectForFile(file.newVirtualPath);
            file.oldDeclarations = declarations(oldProject.program.getSourceFile(file.oldVirtualPath));
            file.newDeclarations = declarations(newProject.program.getSourceFile(file.newVirtualPath));
          }
        }
      } finally {
        snapshot.dispose();
      }
    } finally {
      api.close();
    }
  }
}

function declarationGroups(values) {
  const groups = new Map();
  for (const value of values) {
    const group = groups.get(value.key) ?? [];
    group.push(value);
    groups.set(value.key, group);
  }
  return groups;
}

function changedLines(file, side) {
  return file.rows
    .filter((row) => row.kind === (side === "old" ? "delete" : "add"))
    .map((row) => side === "old" ? row.oldLine : row.newLine);
}

function containsLine(range, line) {
  return range !== undefined && range[0] <= line && line <= range[1];
}

function intersects(range, lines) {
  return range !== undefined && lines.some((line) => containsLine(range, line));
}

function firstLine(value) {
  const starts = [value.old?.range[0], value.new?.range[0]].filter((line) => line !== undefined);
  return Math.min(...starts);
}

function mergeDeclarations(oldValues, newValues, oldChanged, newChanged) {
  const oldGroups = declarationGroups(oldValues);
  const newGroups = declarationGroups(newValues);
  const merged = [];
  for (const key of new Set([...oldGroups.keys(), ...newGroups.keys()])) {
    const oldGroup = oldGroups.get(key) ?? [];
    const newGroup = newGroups.get(key) ?? [];
    if (oldGroup.length <= 1 && newGroup.length <= 1) {
      const oldValue = oldGroup[0];
      const newValue = newGroup[0];
      const value = newValue ?? oldValue;
      const oldParentGroup = value.parentKey === undefined ? [] : oldGroups.get(value.parentKey) ?? [];
      const newParentGroup = value.parentKey === undefined ? [] : newGroups.get(value.parentKey) ?? [];
      const parentIsAmbiguous = oldParentGroup.length > 1 || newParentGroup.length > 1;
      if (!parentIsAmbiguous && (intersects(oldValue?.range, oldChanged) || intersects(newValue?.range, newChanged))) {
        merged.push({
          key,
          kind: value.kind,
          name: value.name,
          parentKey: value.parentKey,
          old: oldValue,
          new: newValue,
        });
      }
    }
  }

  const keys = new Set(merged.map((value) => value.key));
  for (const value of [...merged]) {
    if (value.parentKey !== undefined && !keys.has(value.parentKey)) {
      const oldParentGroup = oldGroups.get(value.parentKey) ?? [];
      const newParentGroup = newGroups.get(value.parentKey) ?? [];
      const oldParent = oldParentGroup[0];
      const newParent = newParentGroup[0];
      if (oldParentGroup.length <= 1 && newParentGroup.length <= 1 && (oldParent !== undefined || newParent !== undefined)) {
        merged.push({
          key: value.parentKey,
          kind: "class",
          name: (newParent ?? oldParent).name,
          old: oldParent,
          new: newParent,
        });
        keys.add(value.parentKey);
      }
    }
  }
  return merged.sort((left, right) => firstLine(left) - firstLine(right));
}

function lineRanges(lines) {
  const ranges = [];
  for (const line of [...new Set(lines)].sort((left, right) => left - right)) {
    const last = ranges.at(-1);
    if (last !== undefined && line === last[1] + 1) {
      last[1] = line;
    } else {
      ranges.push([line, line]);
    }
  }
  return ranges;
}

function fileLocations(fileName, declarationsByKey, oldChanged, newChanged) {
  const oldUnmatched = oldChanged.filter((line) => ![...declarationsByKey.values()].some((value) =>
    containsLine(value.old?.range, line)
  ));
  const newUnmatched = newChanged.filter((line) => ![...declarationsByKey.values()].some((value) =>
    containsLine(value.new?.range, line)
  ));
  return [
    ...lineRanges(oldUnmatched).map((range) => ({ file: fileName, oldLines: range, newLines: null })),
    ...lineRanges(newUnmatched).map((range) => ({ file: fileName, oldLines: null, newLines: range })),
  ];
}

function addElement(elements, nextId, value) {
  const id = `element-${nextId}`;
  elements[id] = value;
  return id;
}

function indexFile(file, elements, nextId) {
  const fileName = file.newPath ?? file.oldPath;
  if (fileName === null) {
    throw new Error("Patch file section has neither an old nor a new path.");
  }

  const oldChanged = changedLines(file, "old");
  const newChanged = changedLines(file, "new");
  const merged = file.oldDeclarations === undefined
    ? []
    : mergeDeclarations(file.oldDeclarations, file.newDeclarations, oldChanged, newChanged);

  const declarationsByKey = new Map(merged.map((value) => [value.key, value]));
  const fileId = addElement(elements, nextId, {
    kind: "file",
    name: fileName,
    locations: file.binary ? [] : fileLocations(fileName, declarationsByKey, oldChanged, newChanged),
  });
  nextId += 1;

  for (const declaration of merged.filter((value) => value.kind === "class" || value.parentKey === undefined)) {
    const id = addElement(elements, nextId, {
      kind: declaration.kind,
      name: declaration.name,
      parentId: fileId,
      locations: [{
        file: fileName,
        oldLines: declaration.old?.range ?? null,
        newLines: declaration.new?.range ?? null,
      }],
    });
    nextId += 1;

    if (declaration.kind === "class") {
      const methods = merged
        .filter((value) => value.parentKey === declaration.key)
        .sort((left, right) => firstLine(left) - firstLine(right));
      for (const method of methods) {
        addElement(elements, nextId, {
          kind: "method",
          name: method.name,
          parentId: id,
          locations: [{
            file: fileName,
            oldLines: method.old?.range ?? null,
            newLines: method.new?.range ?? null,
          }],
        });
        nextId += 1;
      }
    }
  }
  return nextId;
}

function semanticErrors(index, files) {
  const errors = [];
  const entries = Object.entries(index.elements);
  const filesByName = new Map(files.map((file) => [file.newPath ?? file.oldPath, file]));
  for (let position = 0; position < entries.length; position += 1) {
    const [id, element] = entries[position];
    if (id !== `element-${position + 1}`) errors.push(`Expected element-${position + 1}, found ${id}.`);
    if (element.kind === "file") {
      if (element.parentId !== undefined) errors.push(`${id} must not have a parentId.`);
      if (!filesByName.has(element.name)) errors.push(`${id} names a file absent from the patch: ${element.name}.`);
    } else {
      const parent = index.elements[element.parentId];
      if (parent === undefined) {
        errors.push(`${id} references unknown parent ${element.parentId}.`);
      } else if (element.kind === "class" && parent.kind !== "file") {
        errors.push(`${id} class parent must be a file.`);
      } else if (element.kind === "method" && parent.kind !== "class" && parent.kind !== "file") {
        errors.push(`${id} method parent must be a class or file.`);
      }
    }
    for (const location of element.locations) {
      const file = filesByName.get(location.file);
      if (file === undefined) {
        errors.push(`${id} locates a file absent from the patch: ${location.file}.`);
      } else {
        for (const [side, range] of [["old", location.oldLines], ["new", location.newLines]]) {
          if (range !== null) {
            const maximum = file.rows.reduce((value, row) => Math.max(value, row[`${side}Line`] ?? 0), 0);
            if (range[0] > range[1]) errors.push(`${id} has a reversed ${side} line range.`);
            if (range[1] > maximum) errors.push(`${id} has an out-of-bounds ${side} line range.`);
          }
        }
      }
    }
  }

  for (const [id] of entries) {
    const ancestors = new Set([id]);
    let parentId = index.elements[id].parentId;
    while (parentId !== undefined && index.elements[parentId] !== undefined) {
      if (ancestors.has(parentId)) {
        errors.push(`${id} belongs to a parent cycle.`);
        break;
      }
      ancestors.add(parentId);
      parentId = index.elements[parentId].parentId;
    }
  }

  for (const [fileName, file] of filesByName) {
    if (!file.binary) {
      for (const side of ["old", "new"]) {
        for (const line of changedLines(file, side)) {
          const covered = entries.some(([, element]) => element.locations.some((location) =>
            location.file === fileName && containsLine(location[`${side}Lines`] ?? undefined, line)
          ));
          if (!covered) errors.push(`${fileName} ${side} line ${line} is not covered by an indexed element.`);
        }
      }
    }
  }
  return errors;
}

export function generateDiffIndex(patch) {
  const files = parsePatch(patch);
  if (files.length === 0) {
    throw new Error("Patch contains no file sections.");
  }

  for (const file of files) {
    if (!file.binary) {
      file.oldSource = sourceImage(file, "old");
      file.newSource = sourceImage(file, "new");
    }
  }
  populateDeclarations(files);

  const elements = {};
  let nextId = 1;
  for (const file of files) nextId = indexFile(file, elements, nextId);
  const index = { schemaVersion: 1, patch, elements };

  if (!validateSchema(index)) {
    const details = (validateSchema.errors ?? [])
      .map((error) => `${error.instancePath || "/"}: ${error.message}`)
      .join("\n");
    throw new Error(`Generated Diff Index does not match its schema:\n${details}`);
  }
  const errors = semanticErrors(index, files);
  if (errors.length > 0) throw new Error(`Generated Diff Index is invalid:\n${errors.join("\n")}`);
  return index;
}

function defaultOutputPath(patchPath) {
  if (patchPath.endsWith(".code-review.patch")) {
    return `${patchPath.slice(0, -".code-review.patch".length)}.diff-index.json`;
  } else if (patchPath.endsWith(".patch")) {
    return `${patchPath.slice(0, -".patch".length)}.diff-index.json`;
  } else {
    return `${patchPath}.diff-index.json`;
  }
}

async function main() {
  const patchArgument = process.argv[2];
  if (patchArgument === undefined) {
    console.error("Usage: node generate-diff-index.mjs <full-context-patch> [output-json]");
    process.exitCode = 1;
  } else {
    const patchPath = path.resolve(patchArgument);
    const outputPath = path.resolve(process.argv[3] ?? defaultOutputPath(patchPath));
    const index = generateDiffIndex(await readFile(patchPath, "utf8"));
    await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);
    console.log(`Generated Diff Index: ${outputPath}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
