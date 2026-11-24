"use client";

import { X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AgentStartPanel } from "@/components/agent-start/agent-start-panel";
import { Button } from "@/components/ui/button";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

const DISMISS_KEY_PREFIX = "customermates:agent-start-dismissed:";

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    return;
  }
}

export const AgentStartSidebarCard = observer(({ workspaceKey }: { workspaceKey: string }) => {
  const t = useTranslations();
  const { connectedAppsStore: store } = useRootStore();
  const dismissKey = `${DISMISS_KEY_PREFIX}${workspaceKey}`;
  const [dismissed, setDismissed] = useState(true);
  const canManage = store.canManage;

  useEffect(() => {
    setDismissed(readDismissed(dismissKey));
  }, [dismissKey]);

  useEffect(() => {
    if (!canManage || dismissed || store.isReady) return;
    void store.refresh().catch(reportApplicationError);
  }, [canManage, dismissed, store]);

  if (!canManage || dismissed || store.dataRequest.status !== "ready" || store.items.length > 0) return null;

  return (
    <div
      className="relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-xs group-data-[collapsible=icon]:hidden"
      data-agent-start-card=""
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium">{t("AgentStart.sidebarTitle")}</span>

        <Button
          aria-label={t("AgentStart.sidebarDismiss")}
          className="-mt-1 -mr-1 size-6"
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => {
            rememberDismissed(dismissKey);
            setDismissed(true);
          }}
        >
          <X aria-hidden />
        </Button>
      </div>

      <AgentStartPanel className="agent-start-chip-compact" />
    </div>
  );
});
