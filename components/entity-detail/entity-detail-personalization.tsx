"use client";

import type { ReactNode } from "react";
import type { EntityDetailOptions } from "@/features/p13n/p13n.schema";
import type { P13nEntry } from "@/features/p13n/prisma-p13n.repository";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { upsertP13nAction } from "@/app/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reconcileAvailableIds, reconcileColumnOrder } from "./entity-detail-personalization.utils";

export type EntityDetailPersonalizationConfig = {
  p13nId: string;
  defaultStarredFieldIds: string[];
  defaultCollapsedSectionIds?: string[];
  availableFieldIds?: string[];
  sectionIds?: string[];
};

type MoveDirection = "up" | "down";

export type EntityDetailPreviewItem = {
  key: string;
  data?: unknown;
};

type EntityDetailPersonalizationValue = {
  enabled: boolean;
  isPersonalizing: boolean;
  starredFieldIds: string[];
  collapsedSectionIds: string[];
  columnOrder: string[];
  previewFieldValues: Record<string, EntityDetailPreviewItem[]>;
  setIsPersonalizing: (value: boolean) => void;
  toggleStarredField: (fieldId: string) => void;
  setSectionCollapsed: (sectionId: string, collapsed: boolean) => void;
  moveColumn: (columnId: string, direction: MoveDirection) => void;
  setPreviewFieldValue: (fieldId: string, items: EntityDetailPreviewItem[]) => void;
};

const EMPTY_VALUE: EntityDetailPersonalizationValue = {
  enabled: false,
  isPersonalizing: false,
  starredFieldIds: [],
  collapsedSectionIds: [],
  columnOrder: [],
  previewFieldValues: {},
  setIsPersonalizing: () => undefined,
  toggleStarredField: () => undefined,
  setSectionCollapsed: () => undefined,
  moveColumn: () => undefined,
  setPreviewFieldValue: () => undefined,
};

const EntityDetailPersonalizationContext = createContext<EntityDetailPersonalizationValue>(EMPTY_VALUE);

type ProviderProps = {
  children: ReactNode;
  config?: EntityDetailPersonalizationConfig;
  initial?: P13nEntry | null;
  customColumnIds?: string[];
  persistenceScope: string;
};

type PersonalizationSnapshot = {
  p13nId: string;
  detailOptions: EntityDetailOptions;
  columnOrder: string[];
};

type PersistenceChannel = {
  latest: PersonalizationSnapshot;
  pending: PersonalizationSnapshot | null;
  queue: Promise<void>;
  timer: number | null;
};

const persistenceChannels = new Map<string, PersistenceChannel>();

function flushPersistence(channelKey: string) {
  const channel = persistenceChannels.get(channelKey);
  if (!channel) return;

  if (channel.timer !== null) {
    window.clearTimeout(channel.timer);
    channel.timer = null;
  }

  const snapshot = channel.pending;
  channel.pending = null;
  if (!snapshot) return;

  channel.queue = channel.queue
    .then(async () => {
      const result = await upsertP13nAction(snapshot);
      if (!result.ok) toastZodErrorTree(result.error);
    })
    .catch(reportApplicationError);
}

function schedulePersistence(channelKey: string, snapshot: PersonalizationSnapshot) {
  let channel = persistenceChannels.get(channelKey);
  if (!channel) {
    channel = { latest: snapshot, pending: null, queue: Promise.resolve(), timer: null };
    persistenceChannels.set(channelKey, channel);
  }

  channel.latest = snapshot;
  channel.pending = snapshot;
  if (channel.timer !== null) window.clearTimeout(channel.timer);
  channel.timer = window.setTimeout(() => flushPersistence(channelKey), 700);
}

export function resetEntityDetailPersonalizationPersistenceForTests() {
  for (const channel of persistenceChannels.values()) if (channel.timer !== null) window.clearTimeout(channel.timer);

  persistenceChannels.clear();
}

export function EntityDetailPersonalizationProvider({
  children,
  config,
  initial,
  customColumnIds,
  persistenceScope,
}: ProviderProps) {
  const p13nId = config?.p13nId;
  const persistenceChannelKey = p13nId ? `${persistenceScope}:${p13nId}` : undefined;
  const latestSnapshot = persistenceChannelKey ? persistenceChannels.get(persistenceChannelKey)?.latest : undefined;
  const storedOptions = latestSnapshot?.detailOptions ?? initial?.detailOptions;
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [starredFieldIds, setStarredFieldIds] = useState(() =>
    reconcileAvailableIds(
      storedOptions?.starredFieldIds ?? config?.defaultStarredFieldIds ?? [],
      config?.availableFieldIds,
    ),
  );
  const [collapsedSectionIds, setCollapsedSectionIds] = useState(() =>
    reconcileAvailableIds(
      storedOptions?.collapsedSectionIds ?? config?.defaultCollapsedSectionIds ?? [],
      config?.sectionIds,
    ),
  );
  const storedColumnOrder = latestSnapshot?.columnOrder ?? initial?.columnOrder;
  const [columnOrder, setColumnOrder] = useState(() =>
    customColumnIds === undefined
      ? reconcileAvailableIds(storedColumnOrder, undefined)
      : reconcileColumnOrder(customColumnIds, storedColumnOrder),
  );
  const [previewFieldValues, setPreviewFieldValues] = useState<Record<string, EntityDetailPreviewItem[]>>({});
  const lastPersistenceStamp = useRef(
    JSON.stringify({
      p13nId,
      detailOptions: { starredFieldIds, collapsedSectionIds },
      columnOrder,
    }),
  );
  const currentColumnStamp = customColumnIds?.join("|");
  const availableFieldStamp = config?.availableFieldIds?.join("|");
  const sectionStamp = config?.sectionIds?.join("|");

  useEffect(() => {
    if (currentColumnStamp === undefined) return;
    setColumnOrder((current) => {
      const next = reconcileColumnOrder(currentColumnStamp ? currentColumnStamp.split("|") : [], current);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [currentColumnStamp]);

  useEffect(() => {
    const availableFieldIds = availableFieldStamp === undefined ? undefined : availableFieldStamp.split("|");
    setStarredFieldIds((current) => {
      const next = reconcileAvailableIds(current, availableFieldIds);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [availableFieldStamp]);

  useEffect(() => {
    const sectionIds = sectionStamp === undefined ? undefined : sectionStamp.split("|");
    setCollapsedSectionIds((current) => {
      const next = reconcileAvailableIds(current, sectionIds);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [sectionStamp]);

  useEffect(() => {
    if (!p13nId || !persistenceChannelKey) return;
    const snapshot: PersonalizationSnapshot = {
      p13nId,
      detailOptions: {
        starredFieldIds,
        collapsedSectionIds,
      },
      columnOrder,
    };
    const stamp = JSON.stringify(snapshot);
    if (stamp === lastPersistenceStamp.current) return;

    lastPersistenceStamp.current = stamp;
    schedulePersistence(persistenceChannelKey, snapshot);
  }, [collapsedSectionIds, columnOrder, p13nId, persistenceChannelKey, starredFieldIds]);

  useEffect(
    () => () => {
      if (persistenceChannelKey) flushPersistence(persistenceChannelKey);
    },
    [persistenceChannelKey],
  );

  const toggleStarredField = useCallback((fieldId: string) => {
    setStarredFieldIds((current) =>
      current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId],
    );
  }, []);

  const setSectionCollapsed = useCallback((sectionId: string, collapsed: boolean) => {
    setCollapsedSectionIds((current) => {
      if (collapsed) return current.includes(sectionId) ? current : [...current, sectionId];
      return current.filter((id) => id !== sectionId);
    });
  }, []);

  const moveColumn = useCallback((columnId: string, direction: MoveDirection) => {
    setColumnOrder((current) => {
      const index = current.indexOf(columnId);
      if (index < 0) return current;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const setPreviewFieldValue = useCallback((fieldId: string, items: EntityDetailPreviewItem[]) => {
    setPreviewFieldValues((current) => {
      const previous = current[fieldId];
      const unchanged =
        previous?.length === items.length && previous.every((item, index) => item.key === items[index]?.key);
      if (unchanged) return current;
      return { ...current, [fieldId]: items };
    });
  }, []);

  const value = useMemo<EntityDetailPersonalizationValue>(
    () => ({
      enabled: Boolean(config),
      isPersonalizing,
      starredFieldIds,
      collapsedSectionIds,
      columnOrder,
      previewFieldValues,
      setIsPersonalizing,
      toggleStarredField,
      setSectionCollapsed,
      moveColumn,
      setPreviewFieldValue,
    }),
    [
      collapsedSectionIds,
      columnOrder,
      config,
      isPersonalizing,
      moveColumn,
      previewFieldValues,
      setSectionCollapsed,
      setPreviewFieldValue,
      starredFieldIds,
      toggleStarredField,
    ],
  );

  return (
    <EntityDetailPersonalizationContext.Provider value={value}>{children}</EntityDetailPersonalizationContext.Provider>
  );
}

export function useEntityDetailPersonalization() {
  return useContext(EntityDetailPersonalizationContext);
}
