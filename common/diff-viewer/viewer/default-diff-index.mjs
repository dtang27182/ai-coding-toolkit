import { findNewestOutputFile } from "../../find-newest-output-file.mjs";

export async function findNewestDiffIndex(repositoryDirectory, toolkitDirectory) {
  return findNewestOutputFile(repositoryDirectory, toolkitDirectory, [".diff-index.json"]);
}
