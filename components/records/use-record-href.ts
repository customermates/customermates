"use client";

import type { RecordPresetKey } from "@/features/records/record-navigation.schema";

import { useCallback } from "react";

import { useRootStore } from "@/core/stores/root-store.provider";

function usePresetTypeId() {
  const { recordWorkspaceStore } = useRootStore();
  return useCallback(
    (preset: RecordPresetKey) => recordWorkspaceStore.navigation?.types.find((type) => type.presetKey === preset)?.id,
    [recordWorkspaceStore],
  );
}

export function usePresetRecordHref() {
  const presetTypeId = usePresetTypeId();
  return useCallback(
    (preset: RecordPresetKey, recordId: string): string | undefined => {
      const typeId = presetTypeId(preset);
      return typeId ? `/records/${typeId}/${recordId}` : undefined;
    },
    [presetTypeId],
  );
}

export function useOpenPresetRecord() {
  const { recordWorkspaceStore } = useRootStore();
  const presetTypeId = usePresetTypeId();
  return useCallback(
    (preset: RecordPresetKey, recordId: string, preferredInvoker?: HTMLElement | null) => {
      const typeId = presetTypeId(preset);
      if (typeId) recordWorkspaceStore.open({ typeId, recordId }, preferredInvoker);
    },
    [presetTypeId, recordWorkspaceStore],
  );
}
