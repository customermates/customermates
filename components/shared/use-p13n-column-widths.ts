"use client";

import type { SetStateAction } from "react";

import { useCallback, useRef, useState } from "react";

import { latestP13nSnapshot, scheduleP13nPersistence } from "./p13n-persistence-channel";

type ColumnWidthsSnapshot = {
  columnWidths: Record<string, number>;
  p13nId: string;
};

export function useP13nColumnWidths({
  initial,
  p13nId,
  persistenceScope,
}: {
  initial?: Readonly<Record<string, number>>;
  p13nId?: string;
  persistenceScope: string;
}) {
  const channelKey = p13nId ? `${persistenceScope}:${p13nId}:column-widths` : undefined;
  const latest = channelKey ? latestP13nSnapshot<ColumnWidthsSnapshot>(channelKey)?.columnWidths : undefined;
  const [columnWidths, setColumnWidthsState] = useState<Record<string, number>>(() => ({
    ...(latest ?? initial ?? {}),
  }));
  const currentRef = useRef(columnWidths);

  const commitColumnWidths = useCallback(
    (value: SetStateAction<Record<string, number>>) => {
      const next = typeof value === "function" ? value(currentRef.current) : value;
      currentRef.current = next;
      setColumnWidthsState(next);
      if (channelKey && p13nId) scheduleP13nPersistence(channelKey, { p13nId, columnWidths: next });
    },
    [channelKey, p13nId],
  );

  return { columnWidths, commitColumnWidths };
}
