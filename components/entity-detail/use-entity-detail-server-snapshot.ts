"use client";

import type {
  BaseCustomColumnEntityModalStore,
  EntityDto,
  FormEntityDto,
} from "@/core/base/base-custom-column-entity-modal.store";
import type { EntityDetailInitial } from "./entity-detail-layout";

import { useLayoutEffect, useRef, useState } from "react";

import { reportApplicationError } from "@/core/errors/report-application-error";

type AppliedSnapshot = {
  entityId: string;
  entityInitial: EntityDetailInitial | null | undefined;
  store: object;
};

function matchesSnapshot(
  snapshot: AppliedSnapshot | null,
  store: object,
  entityId: string,
  entityInitial: EntityDetailInitial | null | undefined,
) {
  return snapshot?.store === store && snapshot.entityId === entityId && snapshot.entityInitial === entityInitial;
}

export function useEntityDetailServerSnapshot<Form extends FormEntityDto, Dto extends EntityDto>(
  store: BaseCustomColumnEntityModalStore<Form, Dto>,
  entityId: string,
  entityInitial: EntityDetailInitial | null | undefined,
) {
  const appliedRef = useRef<AppliedSnapshot | null>(null);
  const [applied, setApplied] = useState<AppliedSnapshot | null>(null);
  const serverSnapshotApplied = entityInitial === undefined || matchesSnapshot(applied, store, entityId, entityInitial);

  useLayoutEffect(() => {
    if (matchesSnapshot(appliedRef.current, store, entityId, entityInitial)) return;

    const snapshot = { entityId, entityInitial, store };
    appliedRef.current = snapshot;

    if (entityInitial?.entity.id === entityId)
      store.hydrateServerSnapshot(entityInitial.entity as Dto, entityInitial.customColumns);
    else if (entityInitial === null || store.fetchedEntity?.id !== entityId) {
      const requestAlreadyLoading = store.requestedEntityId === entityId && store.entityLoadState === "loading";
      if (!requestAlreadyLoading) void store.loadById(entityId).catch(reportApplicationError);
    }

    setApplied(snapshot);
  }, [entityId, entityInitial, store]);

  return serverSnapshotApplied;
}
