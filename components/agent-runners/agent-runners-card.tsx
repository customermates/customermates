"use client";

import type { AgentRunnerClientName, AgentRunnerDto } from "@/features/agent-runners/agent-runner.schema";
import type { AgentRunnerStatus } from "./agent-runner-status";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useLayoutEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoRow } from "@/components/shared/info-row";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { AGENT_RUNNER_BADGE_VARIANTS, agentRunnerStatus } from "./agent-runner-status";
import { AgentRunnerModal } from "./agent-runner-modal";

type Props = { runners: AgentRunnerDto[] };

export const AgentRunnersCard = observer(({ runners }: Props) => {
  const t = useTranslations();
  const { agentRunnersStore: store, agentRunnerModalStore: modal } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const { showConfirmation } = useDeleteConfirmation();
  const { canManage } = store;

  const statusLabels: Record<AgentRunnerStatus, string> = {
    online: t("Runners.status.online"),
    offline: t("Runners.status.offline"),
    neverSeen: t("Runners.status.neverSeen"),
    revoked: t("Runners.status.revoked"),
  };
  const clientLabels: Record<AgentRunnerClientName, string> = {
    claude: t("Runners.clientNames.claude"),
    codex: t("Runners.clientNames.codex"),
    gemini: t("Runners.clientNames.gemini"),
  };

  useLayoutEffect(() => store.setItems({ items: runners }), [runners, store]);

  function revoke(runner: AgentRunnerDto) {
    showConfirmation({
      title: t("Runners.revokeTitle"),
      message: t("Runners.revokeDescription", { name: runner.name }),
      confirmLabel: t("Runners.revoke"),
      confirmVariant: "destructive",
      successKey: "Runners.toastRevoked",
      onConfirm: () => store.revoke(runner.id),
    });
  }

  return (
    <section
      data-agent-runners-card
      className="animate-page-result-in flex w-full max-w-3xl flex-col gap-4 motion-reduce:animate-none"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-x-lg">{t("Runners.title")}</h2>

          <p className="text-sm text-muted-foreground">{t("Runners.description")}</p>
        </div>

        {canManage ? (
          <Button id="agent-runners-add" size="sm" variant="secondary" onClick={() => modal.add()}>
            {t("Runners.add")}
          </Button>
        ) : null}
      </div>

      {store.items.length > 0 ? (
        <div className="flex flex-col gap-3">
          {store.items.map((runner) => {
            const status = agentRunnerStatus(runner);
            return (
              <Card key={runner.id} className="gap-3 py-4" data-agent-runner={runner.id} data-status={status}>
                <CardContent className="flex flex-col gap-2 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{runner.name}</p>

                    <Badge variant={AGENT_RUNNER_BADGE_VARIANTS[status]}>{statusLabels[status]}</Badge>
                  </div>

                  <InfoRow label={t("Runners.machine")}>{runner.machine ?? t("Common.never")}</InfoRow>

                  <InfoRow label={t("Runners.clients")}>
                    {runner.clients.length > 0
                      ? runner.clients.map((client) => `${clientLabels[client.name]} ${client.version}`).join(", ")
                      : t("Runners.noClients")}
                  </InfoRow>

                  <InfoRow label={t("Runners.lastSeen")}>
                    {runner.lastSeenAt
                      ? intlStore.formatNumericalShortDateTime(new Date(runner.lastSeenAt))
                      : t("Common.never")}
                  </InfoRow>

                  {canManage && status !== "revoked" ? (
                    <div className="flex justify-end pt-1">
                      <Button size="sm" variant="ghost" onClick={() => revoke(runner)}>
                        {t("Runners.revoke")}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <AgentRunnerModal />
    </section>
  );
});
