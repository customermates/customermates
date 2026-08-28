"use client";

import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

import { useEntityDetailPersonalization } from "./entity-detail-personalization";

type Props = {
  children: ReactNode;
  fieldId?: string;
  className?: string;
};

export function EntityDetailField({ children, fieldId, className }: Props) {
  const {
    applyFieldVisibility = true,
    enabled,
    hiddenFieldIds = [],
    isPersonalizing = false,
  } = useEntityDetailPersonalization();
  const hidden = Boolean(fieldId && applyFieldVisibility && enabled && hiddenFieldIds.includes(fieldId));

  if (hidden && !isPersonalizing) return null;

  return (
    <div
      className={cn("contents", hidden && "[&>*]:opacity-50", className)}
      data-entity-field={fieldId}
      data-field-hidden={hidden || undefined}
    >
      {children}
    </div>
  );
}
