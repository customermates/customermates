"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { AppModal } from "@/components/modal";
import { Alert } from "@/components/shared/alert";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  AGENT_PROVIDERS,
  agentProviderModels,
  isAgentProvider,
  type AgentProviderId,
} from "@/ee/agent-keys/agent-provider-models";
import {
  AGENT_PROVIDER_KEY_LABEL_MAX_CHARS,
  AGENT_PROVIDER_KEY_MAX_CHARS,
} from "@/ee/agent-keys/agent-provider-key.schema";

import { agentProviderLabel } from "./agent-labels";

export const AgentKeyModal = observer(() => {
  const t = useTranslations();
  const { agentKeyModalStore: store } = useRootStore();
  const provider: AgentProviderId = isAgentProvider(store.form.provider) ? store.form.provider : "anthropic";
  const title = t("AgentKeys.modalTitle");

  return (
    <AppModal size="xl" store={store} title={title}>
      <AppForm store={store}>
        <AppCard className="relative">
          <AppCardHeader>
            <h2 className="truncate text-x-lg">{title}</h2>
          </AppCardHeader>

          <AppCardBody className="pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]">
            <Alert description={t("AgentKeys.replaceNote")} variant="neutral" />

            <FormSelect
              required
              id="provider"
              inputId="agent-key-provider"
              items={AGENT_PROVIDERS.map((id) => ({ value: id, label: agentProviderLabel(t, id) }))}
              label={t("AgentKeys.fields.provider")}
              value={provider}
              onValueChange={(value) => {
                if (isAgentProvider(value)) store.selectProvider(value);
              }}
            />

            <FormInput
              required
              id="label"
              inputId="agent-key-label"
              label={t("AgentKeys.fields.label")}
              maxLength={AGENT_PROVIDER_KEY_LABEL_MAX_CHARS}
              placeholder={t("AgentKeys.fields.labelPlaceholder")}
            />

            <FormInput
              required
              autoCapitalize="none"
              autoComplete="off"
              description={t("AgentKeys.fields.apiKeyDescription")}
              id="apiKey"
              inputId="agent-key-api-key"
              label={t("AgentKeys.fields.apiKey")}
              maxLength={AGENT_PROVIDER_KEY_MAX_CHARS}
              spellCheck={false}
              type="password"
            />

            <FormSelect
              required
              description={t("AgentKeys.fields.defaultModelDescription")}
              id="defaultModel"
              inputId="agent-key-default-model"
              items={agentProviderModels(provider).map((model) => ({ value: model.id, label: model.label }))}
              label={t("AgentKeys.fields.defaultModel")}
            />
          </AppCardBody>

          <UnsavedChangesBar creating anchorScope="agent-key" store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
