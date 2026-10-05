"use client";

import { observer } from "mobx-react-lite";
import { useLayoutEffect } from "react";

import { useRootStore } from "@/core/stores/root-store.provider";

import { UnsavedChangesGuard } from "./unsaved-changes-guard";
import { connectNavigationHistoryGuard } from "./navigation-history-guard";

export const NavigationGuardModal = observer(() => {
  const { navigationGuard } = useRootStore();
  useLayoutEffect(() => connectNavigationHistoryGuard(navigationGuard), [navigationGuard]);

  return (
    <UnsavedChangesGuard
      open={navigationGuard.isPending}
      onCancel={() => navigationGuard.cancel()}
      onConfirm={() => navigationGuard.confirm()}
    />
  );
});
