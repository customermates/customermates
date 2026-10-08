"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { AppModal } from "@/components/modal/app-modal";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ContactComposePopover } from "@/app/[locale]/(protected)/records/[typeId]/components/contact-compose-popover";
import { useNavigationGuard } from "@/components/modal/use-navigation-guard";

export const RecordComposeRecovery = observer(function RecordComposeRecovery() {
  const root = useRootStore();
  const t = useTranslations();
  const compose = root.threadComposeStore;
  const open = compose.isDetachedNewThread && root.appMode !== "self-hosted";
  useNavigationGuard(compose, open);
  return (
    <AppModal
      bodyClassName="px-4 pb-4"
      open={open}
      side="left"
      title={t("EntityChannels.tooltipStartNewThread")}
      onClose={() => {
        if (compose.isLoading) return;
        const isCurrent = compose.captureContext();
        root.navigationGuard.tryNavigate(() => {
          if (isCurrent() && !compose.isLoading) compose.discardNewThread();
        });
      }}
    >
      <p aria-hidden className="pt-4 pb-3 text-base font-semibold">
        {t("EntityChannels.tooltipStartNewThread")}
      </p>

      {compose.form.provider && <ContactComposePopover provider={compose.form.provider} />}
    </AppModal>
  );
});
