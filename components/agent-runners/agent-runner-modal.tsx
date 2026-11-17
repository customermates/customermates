"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormInput } from "@/components/forms/form-input";
import { AppForm } from "@/components/forms/form-context";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { AppModal } from "@/components/modal";
import { Alert } from "@/components/shared/alert";
import { CopyableCode } from "@/components/shared/copyable-code";
import { AGENT_RUNNER_LIMITS } from "@/features/agent-runners/agent-runner.schema";
import { useRootStore } from "@/core/stores/root-store.provider";

import { AgentRunnerCommandsView } from "./agent-runner-commands-view";

export const AgentRunnerModal = observer(() => {
  const t = useTranslations();
  const { agentRunnerModalStore: store } = useRootStore();
  const { createdToken, serverUrl } = store;
  const title = createdToken ? t("Runners.title") : t("Runners.addTitle");

  return (
    <AppModal size="xl" store={store} title={title}>
      <AppForm store={store}>
        <AppCard className="relative">
          <AppCardHeader>
            <h2 className="truncate text-x-lg">{title}</h2>
          </AppCardHeader>

          <AppCardBody className="pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]">
            {createdToken && serverUrl ? (
              <div className="flex flex-col gap-4">
                <Alert hideIcon variant="success">
                  <div className="flex flex-col gap-2">
                    <p className="text-x-md">{t("Runners.tokenCreated")}</p>

                    <p className="text-xs text-muted-foreground">{t("Runners.tokenLabel")}</p>

                    <CopyableCode anchorId="agent-runner-copy-token" id="agent-runner-token" value={createdToken} />

                    <p className="text-x-sm">{t("Runners.tokenWarning")}</p>
                  </div>
                </Alert>

                <AgentRunnerCommandsView token={createdToken} url={serverUrl} />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">{t("Runners.addDescription")}</p>

                <FormInput
                  required
                  id="name"
                  inputId="agent-runner-name"
                  label={t("Common.table.columns.name")}
                  maxLength={AGENT_RUNNER_LIMITS.nameMaxLength}
                />
              </div>
            )}
          </AppCardBody>

          {createdToken ? null : <UnsavedChangesBar creating anchorScope="agent-runner" store={store} />}
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
