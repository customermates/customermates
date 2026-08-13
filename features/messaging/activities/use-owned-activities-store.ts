"use client";

import type { ActivitiesStoreOptions } from "./activities.store";
import type { ActivityScope } from "@/ee/messaging/activities/activity-scope.schema";
import type { ActivitiesResult } from "@/ee/messaging/activities/activities.schema";

import { useEffect, useMemo, useRef } from "react";

import { ActivitiesStore } from "./activities.store";
import { useRootStore } from "@/core/stores/root-store.provider";

export function useOwnedActivitiesStore(
  options: ActivitiesStoreOptions & { initial?: ActivitiesResult },
): ActivitiesStore {
  const rootStore = useRootStore();
  const { defaultP13nId, initial, pageSize } = options;
  const scopeKey = JSON.stringify(options.scope ?? null);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const store = useMemo(() => {
    const ownedStore = new ActivitiesStore(rootStore, {
      defaultP13nId,
      pageSize,
      scope: scopeKey === "null" ? undefined : (JSON.parse(scopeKey) as ActivityScope),
    });
    if (initialRef.current) ownedStore.hydrate(initialRef.current);
    return ownedStore;
  }, [defaultP13nId, pageSize, rootStore, scopeKey]);

  useEffect(() => {
    rootStore.activityTimelines.register(store);
    return () => rootStore.activityTimelines.unregister(store);
  }, [rootStore, store]);

  return store;
}
