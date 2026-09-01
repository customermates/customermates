"use client";

import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";
import type { OperatorWorkspaceStatsDto } from "@/ee/operator/operator.schema";

import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { InfoRow } from "@/components/shared/info-row";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { getOperatorWorkspaceStatsAction } from "../../workspaces/actions";

type Props = { workspace: OperatorWorkspaceRowDto };

export function OperatorWorkspaceStatsPopover({ workspace }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<OperatorWorkspaceStatsDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function load() {
    setIsLoading(true);
    setStats(null);
    try {
      const res = await getOperatorWorkspaceStatsAction({ companyId: workspace.id });
      if (res.ok) setStats(res.data);
      else toastZodErrorTree(res.error);
    } finally {
      setIsLoading(false);
    }
  }

  function onOpenChange(next: boolean) {
    setIsOpen(next);
    if (next) runUserAction(load);
  }

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button aria-label={t("OperatorWorkspaces.stats.title")} size="icon" variant="ghost">
          <ChartNoAxesColumnIncreasing aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="flex w-72 flex-col gap-3">
        <h3 className="text-x-sm font-medium">{t("OperatorWorkspaces.stats.title")}</h3>

        {isLoading ? <Skeleton className="h-40 w-full" /> : null}

        {stats ? (
          <div className="flex flex-col gap-1.5">
            <InfoRow label={t("OperatorWorkspaces.stats.contacts")}>{intlStore.formatNumber(stats.contacts)}</InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.organizations")}>
              {intlStore.formatNumber(stats.organizations)}
            </InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.deals")}>{intlStore.formatNumber(stats.deals)}</InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.services")}>{intlStore.formatNumber(stats.services)}</InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.tasks")}>{intlStore.formatNumber(stats.tasks)}</InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.threads")}>
              {intlStore.formatNumber(stats.messagingThreads)}
            </InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.messages")}>
              {intlStore.formatNumber(stats.messagingMessages)}
            </InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.assistantConversations")}>
              {intlStore.formatNumber(stats.agentConversations)}
            </InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.connectedAccounts")}>
              {intlStore.formatNumber(stats.connectedAccounts)}
            </InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.lastActive")}>
              {stats.lastActiveAt
                ? intlStore.formatNumericalShortDateTime(stats.lastActiveAt)
                : t("OperatorWorkspaces.stats.never")}
            </InfoRow>

            <InfoRow label={t("OperatorWorkspaces.stats.lastActivity")}>
              {stats.lastActivityAt
                ? intlStore.formatNumericalShortDateTime(stats.lastActivityAt)
                : t("OperatorWorkspaces.stats.never")}
            </InfoRow>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
