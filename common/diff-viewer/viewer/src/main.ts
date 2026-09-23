import "./standalone.css";
import { mountDiffViewer } from "./viewer.ts";

mountDiffViewer(document.querySelector<HTMLElement>("#app")!);
