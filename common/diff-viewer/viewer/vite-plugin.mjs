import { defaultOutputFilePlugin } from "../../default-output-file-plugin.mjs";
import { findNewestDiffIndex } from "./default-diff-index.mjs";

export function defaultDiffIndexPlugin(repositoryDirectory, toolkitDirectory) {
  return defaultOutputFilePlugin(
    "default-diff-index",
    "/__diff-index/default",
    findNewestDiffIndex,
    repositoryDirectory,
    toolkitDirectory,
  );
}
