export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 640;
export const MIN_FILE_PANEL_WIDTH = 320;

export function clampSidebarWidth(width: number, workspaceWidth: number): number {
  const availableMaximum = Math.max(MIN_SIDEBAR_WIDTH, workspaceWidth - MIN_FILE_PANEL_WIDTH);
  return Math.round(Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), Math.min(MAX_SIDEBAR_WIDTH, availableMaximum)));
}
