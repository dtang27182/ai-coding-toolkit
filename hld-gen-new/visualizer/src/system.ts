import { mountSystemDataflowViewer } from "../../../common/sys-dataflow/visualizer/src/viewer.ts";
import "./system.css";

mountSystemDataflowViewer(document.querySelector<HTMLElement>("#app")!);
