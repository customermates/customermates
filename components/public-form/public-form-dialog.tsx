"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { DiscardChangesDialog } from "@/components/modal/confirm-dialog";
import { useIsWiderThan } from "@/hooks/use-media-query";

import { publicFormTabActions } from "./public-form-actions-adapter";
import { PublicFormTab } from "./public-form-tab";
import { PublicFormTabStore } from "./public-form-tab.store";

type Props = {
  typeId: string;
  listLabel: string;
  focusReturnTarget?: HTMLElement | null;
  onClose: () => void;
};

export const PublicFormDialog = observer(function PublicFormDialog({
  typeId,
  listLabel,
  focusReturnTarget,
  onClose,
}: Props) {
  const t = useTranslations();
  const wide = useIsWiderThan("lg");
  const store = useMemo(() => new PublicFormTabStore(typeId, publicFormTabActions), [typeId]);
  const [confirming, setConfirming] = useState(false);
  const title = t("PublicForm.dialog.title", { list: listLabel });

  const requestClose = () => {
    if (store.edited) setConfirming(true);
    else onClose();
  };

  return (
    <AppModal
      focusContentOnOpen
      guardsUnsavedChanges
      open
      titleInContent
      focusReturnTarget={focusReturnTarget}
      size={wide ? "5xl" : undefined}
      title={title}
      onClose={requestClose}
    >
      <AppCard id="public-form-dialog">
        <AppCardHeader>
          <div className="flex min-w-0 flex-col gap-1.5">
            <AppModalTitle className="text-lg font-semibold">{title}</AppModalTitle>

            <p className="text-sm text-muted-foreground">{t("PublicForm.dialog.description")}</p>
          </div>
        </AppCardHeader>

        <PublicFormTab store={store} onClose={onClose} />
      </AppCard>

      <DiscardChangesDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onClose();
        }}
      />
    </AppModal>
  );
});
