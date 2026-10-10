"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";

export function useRecordRouteReady() {
  const pathname = usePathname();
  const store = useRootStore().recordWorkspaceStore;
  useEffect(() => store.registerRoute(pathname), [store, pathname]);
}
