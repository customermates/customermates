"use client";

import type { SetStateAction } from "react";

import { useCallback, useRef, useState } from "react";

import { upsertP13nAction } from "@/app/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type Snapshot = {
  columnWidths: Record<string, number>;
  p13nId: string;
};

type PersistenceChannel = {
  latest: Snapshot;
  pending: Snapshot | null;
  running: boolean;
};

const persistenceChannels = new Map<string, PersistenceChannel>();

function flushPersistence(channelKey: string) {
  const channel = persistenceChannels.get(channelKey);
  if (!channel) return;
  if (channel.running) return;
  const snapshot = channel.pending;
  channel.pending = null;
  if (!snapshot) return;

  channel.running = true;
  void Promise.resolve()
    .then(async () => {
      const result = await upsertP13nAction(snapshot);
      if (!result.ok) toastZodErrorTree(result.error);
    })
    .catch(reportApplicationError)
    .finally(() => {
      channel.running = false;
      if (channel.pending) flushPersistence(channelKey);
    });
}

function commitPersistence(channelKey: string, snapshot: Snapshot) {
  let channel = persistenceChannels.get(channelKey);
  if (!channel) {
    channel = {
      latest: snapshot,
      pending: null,
      running: false,
    };
    persistenceChannels.set(channelKey, channel);
  }

  channel.latest = snapshot;
  channel.pending = snapshot;
  flushPersistence(channelKey);
}

export function resetP13nColumnWidthPersistenceForTests() {
  persistenceChannels.clear();
}

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
  const latest = channelKey ? persistenceChannels.get(channelKey)?.latest.columnWidths : undefined;
  const [columnWidths, setColumnWidthsState] = useState<Record<string, number>>(() => ({
    ...(latest ?? initial ?? {}),
  }));
  const currentRef = useRef(columnWidths);

  const commitColumnWidths = useCallback(
    (value: SetStateAction<Record<string, number>>) => {
      const next = typeof value === "function" ? value(currentRef.current) : value;
      currentRef.current = next;
      setColumnWidthsState(next);
      if (channelKey && p13nId) commitPersistence(channelKey, { p13nId, columnWidths: next });
    },
    [channelKey, p13nId],
  );

  return { columnWidths, commitColumnWidths };
}
