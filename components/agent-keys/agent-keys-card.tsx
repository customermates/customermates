"use client";

import type { AiClientLogoProvider } from "@/components/ai-connection/ai-client-logo";
import type { AgentProviderId } from "@/ee/agent-keys/agent-provider-models";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { Alert } from "@/components/shared/alert";
import {
  SettingsPanel,
  SettingsPanelLogo,
  SettingsPanelMessage,
  SettingsPanelRow,
} from "@/components/shared/settings-panel";
import { Button } from "@/components/ui/button";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { agentProviderLabel } from "./agent-labels";

type Props = { planAllowed: boolean };

const PROVIDER_LOGOS: Record<AgentProviderId, AiClientLogoProvider> = {
  anthropic: "claude",
  openai: "openai",
  google: "gemini",
};

export const AgentKeysCard = observer(({ planAllowed }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { agentKeyModalStore, agentKeysStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const canManage = agentKeysStore.canManage;

  return (
    <SettingsPanel
      action={
        canManage ? (
          <Button
            disabled={!planAllowed}
            id="agent-key-add"
            size="sm"
            variant="secondary"
            onClick={() => agentKeyModalStore.add()}
          >
            <Plus aria-hidden className="size-4" />

            {t("AgentKeys.add")}
          </Button>
        ) : null
      }
      description={t("AgentKeys.keysDescription")}
      footer={
        planAllowed ? null : (
          <Alert description={t("AgentKeys.planRequired")} id="agent-keys-plan" role="note" variant="neutral" />
        )
      }
      id="agent-keys"
      title={t("AgentKeys.keysTitle")}
    >
      {agentKeysStore.items.length === 0 ? (
        <SettingsPanelMessage>
          <span className="flex items-center gap-3">
            {Object.values(PROVIDER_LOGOS).map((provider) => (
              <SettingsPanelLogo key={provider}>
                <AiClientLogo provider={provider} />
              </SettingsPanelLogo>
            ))}

            <span>{t("AgentKeys.keysEmpty")}</span>
          </span>
        </SettingsPanelMessage>
      ) : (
        agentKeysStore.items.map((key) => (
          <SettingsPanelRow key={key.id} className="flex-wrap sm:flex-nowrap" data-agent-key={key.provider}>
            <SettingsPanelLogo>
              <AiClientLogo provider={PROVIDER_LOGOS[key.provider]} />
            </SettingsPanelLogo>

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{key.label}</span>

                <span className="shrink-0 text-xs text-muted-foreground">{agentProviderLabel(t, key.provider)}</span>
              </span>

              <span className="truncate text-xs text-muted-foreground">
                {[
                  t("AgentKeys.endsIn", { last4: key.last4 }),
                  key.defaultModel,
                  t("AgentsPage.keyChecked", {
                    date: key.validatedAt
                      ? intlStore.formatNumericalShortDateTime(new Date(key.validatedAt))
                      : t("Common.never"),
                  }),
                  t("AgentsPage.keyLastUsed", {
                    date: key.lastUsedAt
                      ? intlStore.formatNumericalShortDateTime(new Date(key.lastUsedAt))
                      : t("Common.never"),
                  }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>

              {key.validatedAt ? null : (
                <span data-agent-key-unverified className="text-xs text-muted-foreground" role="note">
                  {t("AgentKeys.unverifiedNote")}
                </span>
              )}
            </span>

            {canManage ? (
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  disabled={agentKeysStore.busyId === key.id}
                  id={`agent-key-test-${key.provider}`}
                  size="sm"
                  variant="secondary"
                  onClick={() => runUserAction(() => agentKeysStore.test(key.id))}
                >
                  {t("AgentKeys.test")}
                </Button>

                <Button
                  id={`agent-key-remove-${key.provider}`}
                  size="sm"
                  variant="ghostDestructive"
                  onClick={() => showDeleteConfirmation(() => agentKeysStore.remove(key.id), key.label)}
                >
                  <Trash2 aria-hidden className="size-4" />

                  {t("Common.actions.remove")}
                </Button>
              </span>
            ) : null}
          </SettingsPanelRow>
        ))
      )}
    </SettingsPanel>
  );
});
