"use client";

import { observer } from "mobx-react-lite";
import { useLayoutEffect } from "react";

import { useRootStore } from "@/core/stores/root-store.provider";

import { DiscardChangesDialog } from "./confirm-dialog";
import { connectNavigationHistoryGuard } from "./navigation-history-guard";

export const NavigationGuardModal = observer(() => {
  const { navigationGuard } = useRootStore();
  useLayoutEffect(() => connectNavigationHistoryGuard(navigationGuard), [navigationGuard]);

  return (
    <DiscardChangesDialog
      open={navigationGuard.isPending}
      onCancel={() => navigationGuard.cancel()}
      onConfirm={() => navigationGuard.confirm()}
    />
  );
});
