"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { keepOpenForAssistantSurface, releaseFocusToAssistantSurface } from "@/components/modal/assistant-surface";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ContactComposePopover } from "@/app/[locale]/(protected)/records/[typeId]/components/contact-compose-popover";
import { useNavigationGuard } from "@/components/modal/use-navigation-guard";

export const RecordComposeRecovery = observer(function RecordComposeRecovery() {
  const root = useRootStore();
  const t = useTranslations();
  const compose = root.threadComposeStore;
  const open = compose.isDetachedNewThread && root.appMode !== "self-hosted";
  const focusReturn = useOverlayFocusReturn(open);
  useNavigationGuard(compose, open);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next || compose.isLoading) return;
        const isCurrent = compose.captureContext();
        root.navigationGuard.tryNavigate(() => {
          if (isCurrent() && !compose.isLoading) compose.discardNewThread();
        });
      }}
    >
      <SheetContent
        aria-describedby={undefined}
        className="w-full sm:max-w-[640px]"
        side="left"
        onBlur={releaseFocusToAssistantSurface}
        onEscapeKeyDown={keepOpenForAssistantSurface}
        onInteractOutside={keepOpenForAssistantSurface}
        {...focusReturn}
      >
        <SheetHeader>
          <SheetTitle>{t("EntityChannels.tooltipStartNewThread")}</SheetTitle>
        </SheetHeader>

        <SheetBody className="px-4 pb-4">
          {compose.form.provider && <ContactComposePopover provider={compose.form.provider} />}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
});
