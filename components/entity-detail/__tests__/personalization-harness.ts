import type { ReactNode } from "react";

import { createElement, useState } from "react";

import { EntityDetailPersonalizationContext } from "../entity-detail-personalization";

function toggle(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];
}

export function PersonalizationHarness({
  applyFieldVisibility = true,
  children,
  hidden = [],
  starred = [],
}: {
  applyFieldVisibility?: boolean;
  children?: ReactNode;
  hidden?: string[];
  starred?: string[];
}) {
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [hiddenFieldIds, setHiddenFieldIds] = useState(hidden);
  const [starredFieldIds, setStarredFieldIds] = useState(starred);
  const [fieldOrder, reorderFields] = useState<string[]>([]);

  return createElement(
    EntityDetailPersonalizationContext.Provider,
    {
      value: {
        enabled: true,
        applyFieldVisibility,
        isPersonalizing,
        starredFieldIds,
        hiddenFieldIds,
        fieldOrder,
        previewFieldValues: {},
        setIsPersonalizing,
        toggleStarredField: (id) => setStarredFieldIds((current) => toggle(current, id)),
        toggleFieldVisibility: (id) => setHiddenFieldIds((current) => toggle(current, id)),
        reorderFields,
        setPreviewFieldValue: () => undefined,
      },
    },
    children,
  );
}
