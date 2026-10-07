"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

import { ConfirmDialog } from "./confirm-dialog";

export const DeleteConfirmationModal = observer(() => {
  const t = useTranslations();
  const { deleteConfirmationModalStore: store } = useRootStore();
  const { isLoading, form, close } = store;
  const blocked = Boolean(form.blockers?.length);

  return (
    <ConfirmDialog
      anchorScope="confirm-delete"
      busy={isLoading}
      confirmLabel={form.confirmLabel || t("Common.actions.delete")}
      confirmVariant={form.confirmVariant || "destructive"}
      confirmationText={form.confirmationText}
      description={form.message || t("Common.deleteConfirmation.message")}
      open={store.isOpen}
      title={form.title || t("Common.deleteConfirmation.title")}
      onCancel={close}
      onCloseAutoFocus={(event) => {
        if (store.restoreConfirmedFocus()) event.preventDefault();
      }}
      onConfirm={blocked ? undefined : () => store.onSubmit()}
    >
      {form.details?.length ? (
        <ul className="list-disc space-y-1 ps-5 text-sm" data-delete-confirmation-details="">
          {form.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}

      {form.blockers?.length ? (
        <div className="space-y-1 text-sm" data-delete-confirmation-blockers="">
          <p className="font-medium text-destructive">{t("Common.deleteConfirmation.blocked")}</p>

          <ul className="list-disc space-y-1 ps-5">
            {form.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </ConfirmDialog>
  );
});
