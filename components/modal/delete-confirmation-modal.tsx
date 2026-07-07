"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Button } from "@/components/ui/button";
import { AppForm } from "@/components/forms/form-context";
import { useRootStore } from "@/core/stores/root-store.provider";

import { AppModal } from "./app-modal";

export const DeleteConfirmationModal = observer(() => {
  const t = useTranslations();
  const { deleteConfirmationModalStore: store } = useRootStore();
  const { isLoading, form, close } = store;
  const title = form.title || t("Common.deleteConfirmation.title");

  return (
    <AppModal size="sm" store={store} title={title}>
      <AppForm store={store} onSubmit={store.onSubmit}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-base font-semibold">{title}</h2>
          </AppCardHeader>

          <AppCardBody>
            <p className="text-sm">{form.message || t("Common.deleteConfirmation.message")}</p>
          </AppCardBody>

          <AppCardFooter>
            <Button
              disabled={isLoading}
              id="confirm-delete-cancel"
              type="button"
              variant="outline"
              onClick={() => close()}
            >
              {t("Common.actions.cancel")}
            </Button>

            <Button disabled={isLoading} id="confirm-delete" type="submit" variant="destructive">
              {t("Common.actions.delete")}
            </Button>
          </AppCardFooter>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
