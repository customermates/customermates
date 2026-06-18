"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/modal";
import { AppForm } from "@/components/forms/form-context";
import { FormTextarea } from "@/components/forms/form-textarea";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { useRootStore } from "@/core/stores/root-store.provider";

export const FeedbackModal = observer(() => {
  const t = useTranslations();
  const { feedbackModalStore: store } = useRootStore();
  const { isLoading, close, form } = store;

  const translationKey = `feedback.${form.type}`;

  return (
    <AppModal store={store} title={t(`${translationKey}.title`)}>
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-x-lg">{t(`${translationKey}.title`)}</h2>
          </AppCardHeader>

          <AppCardBody>
            <p className="text-x-sm">{t(`${translationKey}.description`)}</p>

            <FormTextarea required id="feedback" rows={6} />
          </AppCardBody>

          <AppCardFooter>
            <Button disabled={isLoading} variant="secondary" onClick={close}>
              {t("Common.actions.cancel")}
            </Button>

            <Button disabled={isLoading} type="submit">
              {t("Common.actions.save")}
            </Button>
          </AppCardFooter>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
