"use client";

import { observer } from "mobx-react-lite";

import { useRootStore } from "@/core/stores/root-store.provider";

import { UnsavedChangesGuard } from "./unsaved-changes-guard";

export const NavigationGuardModal = observer(() => {
  const { navigationGuard } = useRootStore();

  return (
    <UnsavedChangesGuard
      open={navigationGuard.isPending}
      onCancel={() => navigationGuard.cancel()}
      onConfirm={() => navigationGuard.confirm()}
    />
  );
});
