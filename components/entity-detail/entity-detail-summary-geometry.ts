export type EntityDetailSummaryGeometry = {
  groupSizes: readonly number[];
  id: "details" | "details-activities" | "details-notes" | "details-notes-activities";
  gridTemplateColumns?: string;
};

const GEOMETRY = {
  details: {
    groupSizes: [],
    id: "details",
  },
  detailsActivities: {
    groupSizes: [6, 3],
    id: "details-activities",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr)) 1px repeat(3, minmax(0, 120px))",
  },
  detailsNotes: {
    groupSizes: [6, 3],
    id: "details-notes",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr)) 1px repeat(3, minmax(0, 1fr))",
  },
  detailsNotesActivities: {
    groupSizes: [4, 3, 3],
    id: "details-notes-activities",
    gridTemplateColumns: "repeat(4, minmax(0, 9fr)) 1px repeat(3, minmax(0, 8fr)) 1px repeat(3, minmax(0, 120px))",
  },
} as const satisfies Record<string, EntityDetailSummaryGeometry>;

export function getEntityDetailSummaryGeometry({
  showActivityPanel,
  showNotesPanel,
}: {
  showActivityPanel: boolean;
  showNotesPanel: boolean;
}): EntityDetailSummaryGeometry {
  if (showNotesPanel && showActivityPanel) return GEOMETRY.detailsNotesActivities;
  if (showNotesPanel) return GEOMETRY.detailsNotes;
  if (showActivityPanel) return GEOMETRY.detailsActivities;
  return GEOMETRY.details;
}

export function getSummaryCellGridColumn(index: number, groupSizes: readonly number[]) {
  let column = 1;
  let consumed = 0;

  for (const [groupIndex, groupSize] of groupSizes.entries()) {
    if (index < consumed + groupSize) return column + index - consumed;
    consumed += groupSize;
    column += groupSize;
    if (groupIndex < groupSizes.length - 1) column += 1;
  }

  return column + index - consumed;
}

export function getSummarySeparatorColumns(groupSizes: readonly number[]) {
  const columns: number[] = [];
  let column = 1;

  for (const [groupIndex, groupSize] of groupSizes.entries()) {
    column += groupSize;
    if (groupIndex < groupSizes.length - 1) {
      columns.push(column);
      column += 1;
    }
  }

  return columns;
}

export function isSummaryGroupStart(index: number, groupSizes: readonly number[]) {
  let consumed = 0;

  for (const groupSize of groupSizes) {
    if (index === consumed && consumed > 0) return true;
    consumed += groupSize;
  }

  return false;
}
