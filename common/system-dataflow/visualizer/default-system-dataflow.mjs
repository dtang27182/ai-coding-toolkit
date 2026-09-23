import { findNewestOutputFile } from "../../find-newest-output-file.mjs";

export async function findNewestSystemDataflow(repositoryDirectory, toolkitDirectory) {
  return findNewestOutputFile(
    repositoryDirectory,
    toolkitDirectory,
    [".system-dataflow.json", ".system-dataflow.code-review.json"],
  );
}
