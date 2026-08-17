"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { GetResult } from "@/core/base/base-get.interactor";

import { useEffect, useLayoutEffect } from "react";

import { connectDataViewUrlSync } from "./data-view-url-sync";

type LinkedStore = Pick<BaseDataViewStore<HasId>, "registerOnChange">;

export function useDataViewSync<E extends HasId>(
  store: BaseDataViewStore<E>,
  initialResult: GetResult<E>,
  linkedStores: LinkedStore[] = [],
): void {
  useLayoutEffect(() => store.setItems(initialResult), [initialResult]);

  useEffect(() => {
    const cleanupUrlSync = connectDataViewUrlSync(store);
    const unregisters = linkedStores.map((s) => s.registerOnChange(() => store.refresh()));
    return () => {
      cleanupUrlSync();
      unregisters.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store/linkedStores are stable instances; we only want to wire sync once on mount
  }, []);
}
