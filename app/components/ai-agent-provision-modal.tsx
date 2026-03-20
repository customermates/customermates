"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";

import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XInput } from "@/components/x-inputs/x-input";
import { XForm } from "@/components/x-inputs/x-form";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XCardHeroHeader } from "@/components/x-card/x-card-hero-header";

export const AiAgentProvisionModal = observer(() => {
  const t = useTranslations("");
  const { aiAgentProvisionModalStore: store } = useRootStore();

  return (
    <XModal store={store}>
      <XForm store={store}>
        <XCard className="max-w-xl">
          <XCardHeroHeader subtitle={t("AiAgent.agentSetup.provisioningHint")} title={t("AiAgent.agentSetup.title")} />

          <XCardBody>
            <div className="space-y-4">
              <XInput id="openaiApiKey" label={t("AiAgent.agentSetup.openai")} placeholder="sk-proj-..." />

              <XInput id="anthropicApiKey" label={t("AiAgent.agentSetup.anthropic")} placeholder="sk-ant-..." />
            </div>
          </XCardBody>

          <XCardFooter>
            <div className="flex w-full flex-col space-y-3 items-center">
              <Button className="w-full" color="primary" isLoading={store.isLoading} size="md" type="submit">
                {t("AiAgent.agentSetup.submit")}
              </Button>

              <Button className="w-full" isDisabled={store.isLoading} size="md" type="submit" variant="light">
                {t("AiAgent.agentSetup.skip")}
              </Button>
            </div>
          </XCardFooter>
        </XCard>
      </XForm>
    </XModal>
  );
});
