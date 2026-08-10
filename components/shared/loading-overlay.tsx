"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/ui/spinner";
import { useRootStore } from "@/core/stores/root-store.provider";

export const LoadingOverlay = observer(() => {
  const t = useTranslations();
  const { loadingOverlayStore } = useRootStore();
  const pathname = usePathname();

  useEffect(() => {
    loadingOverlayStore.setIsLoading(false);
  }, [pathname, loadingOverlayStore]);

  if (!loadingOverlayStore.isLoading) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50">
      <Spinner aria-label={t("Loading.text")} className="text-primary" size="lg" />
    </div>
  );
});
