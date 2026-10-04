type StoredWidths = { columnWidths?: Readonly<Record<string, number>> } | null | undefined;

export function recordPanelsP13nId(typeId: string) {
  return `record-panels:${typeId}`;
}

function panelWidths(entry: StoredWidths) {
  const widths = Object.entries(entry?.columnWidths ?? {}).filter(([key]) => key.startsWith("panel:"));
  return widths.length ? Object.fromEntries(widths) : undefined;
}

export function recordPanelWidths(panels: StoredWidths, migratedDetail: StoredWidths) {
  if (panelWidths(panels)) return panels?.columnWidths;
  return panelWidths(migratedDetail) ?? panels?.columnWidths;
}
