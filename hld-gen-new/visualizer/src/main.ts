import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

for (const button of app.querySelectorAll<HTMLButtonElement>("[data-view]")) {
  button.addEventListener("click", () => {
    for (const viewButton of app.querySelectorAll<HTMLButtonElement>("[data-view]")) {
      const selected = viewButton === button;
      viewButton.classList.toggle("active", selected);
      viewButton.setAttribute("aria-pressed", String(selected));
    }
    for (const panel of app.querySelectorAll<HTMLElement>("[data-panel]")) {
      const selected = panel.dataset.panel === button.dataset.view;
      panel.classList.toggle("active", selected);
      panel.setAttribute("aria-hidden", String(!selected));
      panel.inert = !selected;
    }
  });
}
