"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Button } from "@/components/ui/button";
import { AppForm } from "@/components/forms/form-context";
import { useApplicationErrorHandler } from "@/components/shared/unexpected-error-toaster";
import { useRootStore } from "@/core/stores/root-store.provider";

import { AppModal } from "./app-modal";

export const DeleteConfirmationModal = observer(() => {
  const t = useTranslations("Common");
  const handleApplicationError = useApplicationErrorHandler();
  const { deleteConfirmationModalStore: store } = useRootStore();
  const { isLoading, form, close } = store;
  const title = form.title || t("deleteConfirmation.title");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.onConfirm) return;

    store.setIsLoading(true);
    try {
      await form.onConfirm();
      toast.success(t("notifications.deleted"));
      store.close();
    } catch (err) {
      handleApplicationError(err);
    } finally {
      store.setIsLoading(false);
    }
  }

  return (
    <AppModal size="sm" store={store} title={title}>
      <AppForm store={store} onSubmit={handleSubmit}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-base font-semibold">{title}</h2>
          </AppCardHeader>

          <AppCardBody>
            <p className="text-sm">{form.message || t("deleteConfirmation.message")}</p>
          </AppCardBody>

          <AppCardFooter>
            <Button disabled={isLoading} type="button" variant="outline" onClick={() => close()}>
              {t("actions.cancel")}
            </Button>

            <Button disabled={isLoading} type="submit" variant="destructive">
              {t("actions.delete")}
            </Button>
          </AppCardFooter>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
