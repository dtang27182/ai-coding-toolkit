import { mountSystemDataflowViewer } from "../../../common/sys-dataflow/visualizer/src/viewer.ts";
import "./system.css";

const viewer = mountSystemDataflowViewer(document.querySelector<HTMLElement>("#app")!, { loadDefault: false });
window.addEventListener("message", (event: MessageEvent<{ type: string; value: unknown; name: string }>) => {
  if (event.source === window.parent && event.origin === location.origin && event.data.type === "load-sys-dataflow") {
    viewer.loadDataflow(event.data.value, event.data.name);
  }
});
