import { defaultOutputFilePlugin } from "../../default-output-file-plugin.mjs";
import { findNewestSystemDataflow } from "./default-system-dataflow.mjs";

export function defaultSystemDataflowPlugin(repositoryDirectory, toolkitDirectory) {
  return defaultOutputFilePlugin(
    "default-system-dataflow",
    "/__system-dataflow/default",
    findNewestSystemDataflow,
    repositoryDirectory,
    toolkitDirectory,
  );
}
