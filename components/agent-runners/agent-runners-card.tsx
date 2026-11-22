"use client";

import type { AiClientLogoProvider } from "@/components/ai-connection/ai-client-logo";
import type { AgentRunnerClientName } from "@/features/agent-runners/agent-runner.schema";
import type { ListedAgentRunner } from "@/features/agent-runners/get-agent-runners.interactor";
import type { AgentRunnerStatus } from "./agent-runner-status";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Copy, Plus, Server, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect } from "react";
import { toast } from "sonner";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import {
  SettingsPanel,
  SettingsPanelLogo,
  SettingsPanelMessage,
  SettingsPanelRow,
} from "@/components/shared/settings-panel";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ItemActions, ItemActionsTrigger } from "@/components/ui/item-actions";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { runUserAction } from "@/core/errors/report-application-error";
import { copyToClipboard } from "@/core/utils/clipboard";
import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { runnerStartCommand } from "./agent-runner-commands";
import { startAgentRunnerRefresh } from "./agent-runner-refresh";
import { agentRunnerStatus } from "./agent-runner-status";
import { AgentRunnerModal } from "./agent-runner-modal";

type Props = { runners: ListedAgentRunner[] | null };

const NO_RUNNERS: ListedAgentRunner[] = [];

const CLIENT_LOGOS: Record<AgentRunnerClientName, AiClientLogoProvider> = {
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
};

const STATUS_DOT: Record<AgentRunnerStatus, string> = {
  online: "bg-success",
  offline: "bg-warning",
  neverSeen: "bg-muted-foreground",
  revoked: "bg-destructive",
};

const STATUS_TEXT: Record<AgentRunnerStatus, string> = {
  online: "text-success-soft-foreground",
  offline: "text-warning-soft-foreground",
  neverSeen: "text-muted-foreground",
  revoked: "text-destructive-soft-foreground",
};

export const AgentRunnersCard = observer(({ runners }: Props) => {
  const t = useTranslations();
  const { agentRunnersStore: store, agentRunnerModalStore: modal } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const { showConfirmation } = useDeleteConfirmation();
  const { canManage, canRevoke, hasLiveRunner } = store;

  const clientLabels: Record<AgentRunnerClientName, string> = {
    claude: t("Runners.clientNames.claude"),
    codex: t("Runners.clientNames.codex"),
    gemini: t("Runners.clientNames.gemini"),
  };

  useLayoutEffect(() => store.setItems({ items: runners ?? NO_RUNNERS }), [runners, store]);

  useEffect(() => {
    if (!hasLiveRunner) return undefined;
    return startAgentRunnerRefresh(
      () => store.refresh(),
      () => document.visibilityState === "visible",
    );
  }, [hasLiveRunner, store]);

  const statusLabels: Record<AgentRunnerStatus, string> = {
    online: t("Runners.status.online"),
    offline: t("Runners.status.offline"),
    neverSeen: t("Runners.status.neverSeen"),
    revoked: t("Runners.status.revoked"),
  };

  function statusLabel(runner: ListedAgentRunner, status: AgentRunnerStatus) {
    if (status === "offline" && runner.lastSeenAt)
      return t("Runners.offlineSince", { date: intlStore.formatNumericalShortDateTime(new Date(runner.lastSeenAt)) });
    return statusLabels[status];
  }

  function revoke(runner: ListedAgentRunner) {
    showConfirmation({
      title: t("Runners.revokeTitle"),
      message: t("Runners.revokeDescription", { name: runner.name }),
      confirmLabel: t("Runners.revoke"),
      confirmVariant: "destructive",
      successKey: "Runners.toastRevoked",
      onConfirm: () => store.revoke(runner.id),
    });
  }

  async function copyStartCommand() {
    const copied = await copyToClipboard(runnerStartCommand(window.location.origin)).catch(() => false);
    if (copied) toast.success(t("Runners.startCommandCopied"));
  }

  return (
    <SettingsPanel
      action={
        canManage ? (
          <Button id="agent-runners-add" size="sm" variant="secondary" onClick={() => modal.add()}>
            <Plus aria-hidden />

            {t("Runners.add")}
          </Button>
        ) : null
      }
      description={t("Runners.description")}
      footer={<AgentRunnerModal />}
      id="agent-runners"
      title={t("Runners.computersTitle")}
    >
      {store.items.length > 0 ? (
        store.items.map((runner) => {
          const status = agentRunnerStatus(runner);
          const menu =
            canRevoke && status !== "revoked" ? (
              <DropdownMenuItem variant="destructive" onSelect={() => revoke(runner)}>
                <Trash2 aria-hidden />

                {t("Runners.revoke")}
              </DropdownMenuItem>
            ) : undefined;
          return (
            <ItemActions key={runner.id} label={t("Runners.actions", { name: runner.name })} menu={menu}>
              <SettingsPanelRow className="flex-wrap sm:flex-nowrap" data-agent-runner={runner.id} data-status={status}>
                <SettingsPanelLogo>
                  <Server aria-hidden className="size-5 text-muted-foreground" />
                </SettingsPanelLogo>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                    <span className="truncate text-sm font-medium">{runner.name}</span>

                    <span className={cn("flex items-center gap-1 text-xs", STATUS_TEXT[status])}>
                      <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />

                      {statusLabel(runner, status)}
                    </span>
                  </span>

                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {runner.clients.length > 0 ? (
                      runner.clients.map((client) => (
                        <span key={client.name} className="flex items-center gap-1" data-agent-runner-client="">
                          <AiClientLogo className="size-3" provider={CLIENT_LOGOS[client.name]} />

                          {`${clientLabels[client.name]} ${client.version}`}
                        </span>
                      ))
                    ) : (
                      <span>{t("Runners.noClients")}</span>
                    )}

                    {runner.machine ? <span>· {runner.machine}</span> : null}

                    {runner.createdByName ? (
                      <span data-agent-runner-owner="">{`· ${t("Runners.owner")} ${runner.createdByName}`}</span>
                    ) : null}
                  </span>
                </span>

                {status === "revoked" ? null : (
                  <Button size="sm" variant="secondary" onClick={() => runUserAction(copyStartCommand)}>
                    <Copy aria-hidden />

                    {t("Runners.startCommand")}
                  </Button>
                )}

                {menu ? <ItemActionsTrigger /> : null}
              </SettingsPanelRow>
            </ItemActions>
          );
        })
      ) : runners === null ? (
        <SettingsPanelMessage>
          <span data-agent-runners-withheld="">{t("Runners.withheld")}</span>
        </SettingsPanelMessage>
      ) : (
        <SettingsPanelMessage>
          <span data-agent-runners-empty="">{t("Runners.empty")}</span>
        </SettingsPanelMessage>
      )}
    </SettingsPanel>
  );
});
