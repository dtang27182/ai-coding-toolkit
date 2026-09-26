export function isLineWrapShortcut(event: KeyboardEvent): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyZ";
}
