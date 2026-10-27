"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppModal } from "@/components/modal";
import { AppForm } from "@/components/forms/form-context";
import { FormTextarea } from "@/components/forms/form-textarea";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { useRootStore } from "@/core/stores/root-store.provider";

export const FeedbackModal = observer(() => {
  const t = useTranslations();
  const { feedbackModalStore: store } = useRootStore();
  const { form } = store;

  const translationKey = `feedback.${form.type}`;

  return (
    <AppModal store={store} title={t(`${translationKey}.title`)}>
      <AppForm store={store}>
        <AppCard className="relative">
          <AppCardHeader>
            <h2 className="text-x-lg">{t(`${translationKey}.title`)}</h2>
          </AppCardHeader>

          <AppCardBody className="pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]">
            <p className="text-x-sm">{t(`${translationKey}.description`)}</p>

            <FormTextarea required id="feedback" rows={6} />
          </AppCardBody>

          <UnsavedChangesBar creating anchorScope="feedback-modal" store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
