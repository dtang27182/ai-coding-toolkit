import { implementationDataflowErrors } from "../../semantic-errors.mjs";
import type { ImplementationDataflow } from "./types.ts";

export function semanticError(value: ImplementationDataflow): string | undefined {
  return implementationDataflowErrors(value)[0];
}
