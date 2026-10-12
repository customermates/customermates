"use client";

import { createContext, useContext } from "react";

export type EntityDetailPreviewItem = {
  key: string;
  data?: unknown;
};

export type EntityDetailPersonalizationValue = {
  enabled: boolean;
  applyFieldVisibility: boolean;
  isPersonalizing: boolean;
  starredFieldIds: string[];
  hiddenFieldIds: string[];
  availableFieldIds?: string[];
  fieldOrder: string[];
  previewFieldValues: Record<string, EntityDetailPreviewItem[]>;
  fieldSettingsHref?: (fieldId: string) => string | null;
  setIsPersonalizing: (value: boolean) => void;
  toggleStarredField: (fieldId: string) => void;
  toggleFieldVisibility: (fieldId: string) => void;
  reorderFields: (fieldIds: string[]) => void;
  setPreviewFieldValue: (fieldId: string, items: EntityDetailPreviewItem[]) => void;
};

const EMPTY_VALUE: EntityDetailPersonalizationValue = {
  enabled: false,
  applyFieldVisibility: false,
  isPersonalizing: false,
  starredFieldIds: [],
  hiddenFieldIds: [],
  fieldOrder: [],
  previewFieldValues: {},
  setIsPersonalizing: () => undefined,
  toggleStarredField: () => undefined,
  toggleFieldVisibility: () => undefined,
  reorderFields: () => undefined,
  setPreviewFieldValue: () => undefined,
};

export const EntityDetailPersonalizationContext = createContext<EntityDetailPersonalizationValue>(EMPTY_VALUE);

export function useEntityDetailPersonalization() {
  return useContext(EntityDetailPersonalizationContext);
}
