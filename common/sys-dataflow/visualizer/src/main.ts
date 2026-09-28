import "./standalone.css";
import { mountSystemDataflowViewer } from "./viewer.ts";

mountSystemDataflowViewer(document.querySelector<HTMLElement>("#app")!);
