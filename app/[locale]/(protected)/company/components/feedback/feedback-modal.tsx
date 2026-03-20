"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";

import { XForm } from "@/components/x-inputs/x-form";
import { XTextarea } from "@/components/x-inputs/x-textarea";
import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { useRootStore } from "@/core/stores/root-store.provider";

export const FeedbackModal = observer(() => {
  const t = useTranslations();
  const { feedbackModalStore: store } = useRootStore();
  const { isLoading, close, form } = store;

  const translationKey = `feedback.${form.type}`;

  return (
    <XModal store={store}>
      <XForm store={store}>
        <XCard>
          <XCardHeader>
            <h2 className="text-x-lg">{t(`${translationKey}.title`)}</h2>
          </XCardHeader>

          <XCardBody>
            <p className="text-x-sm">{t(`${translationKey}.description`)}</p>

            <XTextarea isRequired id="feedback" maxRows={8} minRows={5} />
          </XCardBody>

          <XCardFooter>
            <Button isDisabled={isLoading} variant="flat" onPress={close}>
              {t("Common.actions.cancel")}
            </Button>

            <Button color="primary" isLoading={isLoading} type="submit">
              {t("Common.actions.save")}
            </Button>
          </XCardFooter>
        </XCard>
      </XForm>
    </XModal>
  );
});
