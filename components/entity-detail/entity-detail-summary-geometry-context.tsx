"use client";

import type { ReactNode } from "react";

import { createContext, useContext } from "react";

import { type EntityDetailSummaryGeometry, getEntityDetailSummaryGeometry } from "./entity-detail-summary-geometry";

const DEFAULT_GEOMETRY = getEntityDetailSummaryGeometry({
  showActivityPanel: false,
  showNotesPanel: false,
});

const EntityDetailSummaryGeometryContext = createContext<EntityDetailSummaryGeometry>(DEFAULT_GEOMETRY);

export function EntityDetailSummaryGeometryProvider({
  children,
  showActivityPanel,
  showNotesPanel,
}: {
  children?: ReactNode;
  showActivityPanel: boolean;
  showNotesPanel: boolean;
}) {
  return (
    <EntityDetailSummaryGeometryContext.Provider
      value={getEntityDetailSummaryGeometry({
        showActivityPanel,
        showNotesPanel,
      })}
    >
      {children}
    </EntityDetailSummaryGeometryContext.Provider>
  );
}

export function useEntityDetailSummaryGeometry() {
  return useContext(EntityDetailSummaryGeometryContext);
}
