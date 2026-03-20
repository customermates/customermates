"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";

import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XInput } from "@/components/x-inputs/x-input";
import { XForm } from "@/components/x-inputs/x-form";
import { useRootStore } from "@/core/stores/root-store.provider";

export const AiAgentEnvironmentVariableModal = observer(() => {
  const t = useTranslations("");
  const { aiAgentEnvironmentVariableModalStore: store } = useRootStore();

  return (
    <XModal store={store}>
      <XForm store={store}>
        <XCard>
          <XCardHeader>
            <h2 className="text-x-lg">{t("AiAgent.environmentVariable.title")}</h2>
          </XCardHeader>

          <XCardBody>
            <p className="text-x-sm">{t("AiAgent.environmentVariable.restartHint")}</p>

            <XInput
              autoFocus
              isRequired
              id="key"
              label={t("AiAgent.environmentVariable.key")}
              placeholder="MY_ENV_KEY"
            />

            <XInput
              id="value"
              label={t("AiAgent.environmentVariable.value")}
              placeholder={t("AiAgent.environmentVariable.valuePlaceholder")}
            />
          </XCardBody>

          <XCardFooter>
            <Button isDisabled={store.isLoading} variant="flat" onPress={store.close}>
              {t("Common.actions.close")}
            </Button>

            <Button color="primary" isLoading={store.isLoading} type="submit">
              {t("Common.actions.save")}
            </Button>
          </XCardFooter>
        </XCard>
      </XForm>
    </XModal>
  );
});
