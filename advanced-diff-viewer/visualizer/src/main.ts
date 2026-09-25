import "../../../common/diff-viewer/viewer/src/standalone.css";
import { mountDiffViewer } from "../../../common/diff-viewer/viewer/src/viewer.ts";

mountDiffViewer(document.querySelector<HTMLElement>("#app")!);
