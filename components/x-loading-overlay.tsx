"use client";

import { observer } from "mobx-react-lite";
import { Spinner } from "@heroui/spinner";

import { useRootStore } from "@/core/stores/root-store.provider";

export const XLoadingOverlay = observer(() => {
  const { loadingOverlayStore } = useRootStore();

  if (!loadingOverlayStore.isLoading) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50">
      <Spinner color="primary" size="lg" />
    </div>
  );
});
