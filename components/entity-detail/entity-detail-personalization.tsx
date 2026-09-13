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
  availableFieldIds?: string[];
};

export type EntityDetailPreviewItem = {
  key: string;
  data?: unknown;
};

type EntityDetailPersonalizationValue = {
  enabled: boolean;
  applyFieldVisibility: boolean;
  isPersonalizing: boolean;
  starredFieldIds: string[];
  hiddenFieldIds: string[];
  availableFieldIds?: string[];
  fieldOrder: string[];
  columnOrder: string[];
  previewFieldValues: Record<string, EntityDetailPreviewItem[]>;
  setIsPersonalizing: (value: boolean) => void;
  toggleStarredField: (fieldId: string) => void;
  toggleFieldVisibility: (fieldId: string) => void;
  reorderFields: (fieldIds: string[]) => void;
  reorderColumns: (columnIds: string[]) => void;
  setPreviewFieldValue: (fieldId: string, items: EntityDetailPreviewItem[]) => void;
};

const EMPTY_VALUE: EntityDetailPersonalizationValue = {
  enabled: false,
  applyFieldVisibility: false,
  isPersonalizing: false,
  starredFieldIds: [],
  hiddenFieldIds: [],
  fieldOrder: [],
  columnOrder: [],
  previewFieldValues: {},
  setIsPersonalizing: () => undefined,
  toggleStarredField: () => undefined,
  toggleFieldVisibility: () => undefined,
  reorderFields: () => undefined,
  reorderColumns: () => undefined,
  setPreviewFieldValue: () => undefined,
};

const EntityDetailPersonalizationContext = createContext<EntityDetailPersonalizationValue>(EMPTY_VALUE);

type ProviderProps = {
  children: ReactNode;
  config?: EntityDetailPersonalizationConfig;
  initial?: P13nEntry | null;
  customColumnIds?: string[];
  persistenceScope: string;
  applyFieldVisibility?: boolean;
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
    channel = {
      latest: snapshot,
      pending: null,
      queue: Promise.resolve(),
      timer: null,
    };
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
  applyFieldVisibility = true,
}: ProviderProps) {
  const p13nId = config?.p13nId;
  const persistenceChannelKey = p13nId ? `${persistenceScope}:${p13nId}` : undefined;
  const latestSnapshot = persistenceChannelKey ? persistenceChannels.get(persistenceChannelKey)?.latest : undefined;
  const storedOptions = latestSnapshot?.detailOptions ?? initial?.detailOptions;
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const initialHiddenFieldIds = reconcileAvailableIds(storedOptions?.hiddenFieldIds ?? [], config?.availableFieldIds);
  const [hiddenFieldIds, setHiddenFieldIds] = useState(() => initialHiddenFieldIds);
  const [fieldOrder, setFieldOrder] = useState(() =>
    reconcileAvailableIds(storedOptions?.fieldOrder, config?.availableFieldIds),
  );
  const [starredFieldIds, setStarredFieldIds] = useState(() =>
    reconcileAvailableIds(
      storedOptions?.starredFieldIds ?? config?.defaultStarredFieldIds ?? [],
      config?.availableFieldIds,
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
      detailOptions: {
        starredFieldIds,
        collapsedSectionIds: [],
        ...(hiddenFieldIds.length > 0 ? { hiddenFieldIds } : {}),
        ...(fieldOrder.length > 0 ? { fieldOrder } : {}),
      },
      columnOrder,
    }),
  );
  const currentColumnStamp = customColumnIds?.join("|");
  const availableFieldStamp = config?.availableFieldIds?.join("|");

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
    setHiddenFieldIds((current) => {
      const next = reconcileAvailableIds(current, availableFieldIds);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
    setFieldOrder((current) => {
      const next = reconcileAvailableIds(current, availableFieldIds);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [availableFieldStamp]);

  useEffect(() => {
    if (!p13nId || !persistenceChannelKey) return;
    const snapshot: PersonalizationSnapshot = {
      p13nId,
      detailOptions: {
        starredFieldIds,
        collapsedSectionIds: [],
        ...(hiddenFieldIds.length > 0 ? { hiddenFieldIds } : {}),
        ...(fieldOrder.length > 0 ? { fieldOrder } : {}),
      },
      columnOrder,
    };
    const stamp = JSON.stringify(snapshot);
    if (stamp === lastPersistenceStamp.current) return;

    lastPersistenceStamp.current = stamp;
    schedulePersistence(persistenceChannelKey, snapshot);
  }, [columnOrder, fieldOrder, hiddenFieldIds, p13nId, persistenceChannelKey, starredFieldIds]);

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

  const toggleFieldVisibility = useCallback((fieldId: string) => {
    setHiddenFieldIds((current) =>
      current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId],
    );
  }, []);

  const reorderFields = useCallback(
    (fieldIds: string[]) => {
      setFieldOrder(fieldIds);
      if (customColumnIds !== undefined) {
        const customIds = new Set(customColumnIds);
        setColumnOrder(fieldIds.filter((id) => customIds.has(id)));
      }
    },
    [customColumnIds],
  );

  const reorderColumns = useCallback((columnIds: string[]) => {
    setColumnOrder(columnIds);
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
      applyFieldVisibility,
      isPersonalizing,
      starredFieldIds,
      hiddenFieldIds,
      availableFieldIds: config?.availableFieldIds,
      fieldOrder,
      columnOrder,
      previewFieldValues,
      setIsPersonalizing,
      toggleStarredField,
      toggleFieldVisibility,
      reorderFields,
      reorderColumns,
      setPreviewFieldValue,
    }),
    [
      columnOrder,
      config,
      applyFieldVisibility,
      hiddenFieldIds,
      fieldOrder,
      isPersonalizing,
      reorderFields,
      reorderColumns,
      previewFieldValues,
      setPreviewFieldValue,
      starredFieldIds,
      toggleFieldVisibility,
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

type EntityDetailCustomizationOptions = {
  canManage: boolean;
  isEditingCustomField: boolean;
  toggleEditingCustomField: () => void;
};

export function useEntityDetailCustomization({
  canManage,
  isEditingCustomField,
  toggleEditingCustomField,
}: EntityDetailCustomizationOptions) {
  const { enabled, isPersonalizing, setIsPersonalizing } = useEntityDetailPersonalization();
  const isCustomizing = enabled
    ? isPersonalizing || (canManage && isEditingCustomField)
    : canManage && isEditingCustomField;
  const onToggleCustomization = useCallback(() => {
    const next = !isCustomizing;
    if (enabled) setIsPersonalizing(next);
    if (canManage && isEditingCustomField !== next) toggleEditingCustomField();
  }, [canManage, enabled, isCustomizing, isEditingCustomField, setIsPersonalizing, toggleEditingCustomField]);

  return { isCustomizing, onToggleCustomization };
}
