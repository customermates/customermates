"use client";

import type { ReactNode } from "react";

import { EntityDetailPinButton } from "@/components/entity-detail/entity-detail-pin-button";
import type { RelationEntityType } from "@/components/entity-detail/entity-relations";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

import { OpenRelationLink } from "./open-relation-link";

export type EntityDetailFieldPersonalization = {
  fieldId: string;
  label?: string;
};

type Props = {
  children?: ReactNode;
  currentEntityId: string | undefined;
  currentEntityType: RelationEntityType;
  personalization?: EntityDetailFieldPersonalization;
  targetEntityType: RelationEntityType;
};

export function EntityRelationActions({
  children,
  currentEntityId,
  currentEntityType,
  personalization,
  targetEntityType,
}: Props) {
  const { plural } = useEntityTerminology();

  if (!personalization && !children && !currentEntityId) return null;

  const fieldLabel = personalization?.label ?? plural(targetEntityType);

  return (
    <span className="flex items-center gap-1">
      {personalization && <EntityDetailPinButton fieldId={personalization.fieldId} label={fieldLabel} />}

      {children}

      <OpenRelationLink
        currentEntityId={currentEntityId}
        currentEntityType={currentEntityType}
        targetEntityType={targetEntityType}
      />
    </span>
  );
}
