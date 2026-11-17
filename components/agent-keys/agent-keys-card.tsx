"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { KeyRound, Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/shared/alert";
import { InfoRow } from "@/components/shared/info-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { agentProviderLabel } from "./agent-labels";

type Props = { planAllowed: boolean };

export const AgentKeysCard = observer(({ planAllowed }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { agentKeyModalStore, agentKeysStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const canManage = agentKeysStore.canManage;

  return (
    <Card className="gap-3 py-4" id="agent-keys">
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-4">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-sm font-medium">{t("AgentKeys.keysTitle")}</CardTitle>

          <p className="text-xs text-muted-foreground">{t("AgentKeys.keysDescription")}</p>
        </div>

        {canManage ? (
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
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4">
        {planAllowed ? null : (
          <Alert description={t("AgentKeys.planRequired")} id="agent-keys-plan" role="note" variant="neutral" />
        )}

        {agentKeysStore.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("AgentKeys.keysEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {agentKeysStore.items.map((key) => (
              <li key={key.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-agent-key={key.provider}>
                <div className="flex min-w-0 items-center gap-2">
                  <KeyRound aria-hidden className="size-4 shrink-0 text-muted-foreground" />

                  <span className="truncate text-sm font-medium">{key.label}</span>

                  <span className="shrink-0 text-xs text-muted-foreground">{agentProviderLabel(t, key.provider)}</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <InfoRow label={t("AgentKeys.fields.apiKey")}>
                    <span data-agent-key-last4>{t("AgentKeys.endsIn", { last4: key.last4 })}</span>
                  </InfoRow>

                  {key.defaultModel ? (
                    <InfoRow label={t("AgentKeys.fields.defaultModel")}>{key.defaultModel}</InfoRow>
                  ) : null}

                  <InfoRow label={t("AgentKeys.checkedAt")}>
                    {key.validatedAt
                      ? intlStore.formatNumericalShortDateTime(new Date(key.validatedAt))
                      : t("Common.never")}
                  </InfoRow>

                  <InfoRow label={t("AgentKeys.lastUsedAt")}>
                    {key.lastUsedAt
                      ? intlStore.formatNumericalShortDateTime(new Date(key.lastUsedAt))
                      : t("Common.never")}
                  </InfoRow>
                </div>

                {canManage ? (
                  <div className="flex items-center gap-2">
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
                      variant="destructive"
                      onClick={() => showDeleteConfirmation(() => agentKeysStore.remove(key.id), key.label)}
                    >
                      <Trash2 aria-hidden className="size-4" />

                      {t("Common.actions.remove")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
});
