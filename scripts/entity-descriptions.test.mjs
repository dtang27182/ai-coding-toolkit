import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const architectureDiffSchema = JSON.parse(await readFile(new URL("../hld-gen/references/architecture-diff.schema.json", import.meta.url), "utf8"));
const example = JSON.parse(await readFile(new URL("../hld-gen/references/architecture-diff.example.json", import.meta.url), "utf8"));
const validateArchitectureDiff = new Ajv2020({ allErrors: true }).compile(architectureDiffSchema);

test("architecture diffs accept optional descriptions on classes, methods, and components", () => {
  assert.equal(validateArchitectureDiff(example), true);
  for (const kind of ["class", "method", "component"]) {
    const copy = structuredClone(example);
    let entity;
    if (kind === "class") {
      entity = copy.classes[0];
    } else if (kind === "method") {
      entity = copy.classes[0].methods[0];
    } else if (kind === "component") {
      entity = copy.components[0];
    }
    entity.generalDescription = "Explains the entity's responsibility in the software system.";
    entity.designRole = "Explains its contribution to the selected design.";
    assert.equal(validateArchitectureDiff(copy), true, JSON.stringify(validateArchitectureDiff.errors));
    delete entity.generalDescription;
    delete entity.designRole;
    assert.deepEqual(copy, example);
  }
});

test("entity descriptions must be nonblank strings when supplied", () => {
  const copy = structuredClone(example);
  for (const entity of [copy.classes[0], copy.classes[0].methods[0], copy.components[0]]) {
    for (const field of ["generalDescription", "designRole"]) {
      for (const invalid of ["", " \n ", null, 3]) {
        entity[field] = invalid;
        assert.equal(validateArchitectureDiff(copy), false);
      }
      delete entity[field];
    }
  }
  assert.equal(validateArchitectureDiff(copy), true);
});
