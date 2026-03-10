const TAB_ID_PREFIX = 'dashboard-tab';
const TAB_PANEL_ID_PREFIX = 'dashboard-tabpanel';

export function getTabId(tabId: string): string {
  return `${TAB_ID_PREFIX}-${tabId}`;
}

export function getTabPanelId(tabId: string): string {
  return `${TAB_PANEL_ID_PREFIX}-${tabId}`;
}
