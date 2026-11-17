"use client";

import type { ReactNode } from "react";
import type { AgentRunnerDto } from "@/features/agent-jobs/agent-runner.schema";

import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

type Props = { runners: AgentRunnerDto[]; actions?: ReactNode };

export function AgentRunnersCard({ runners, actions }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();

  return (
    <Card className="gap-3 py-4" id="agent-runners">
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-4">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-sm font-medium">{t("AgentRuntime.runnersTitle")}</CardTitle>

          <p className="text-xs text-muted-foreground">{t("AgentRuntime.runnersDescription")}</p>
        </div>

        {actions}
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4">
        {runners.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("AgentRuntime.runnersEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {runners.map((runner) => {
              const seen = runner.lastSeenAt
                ? t("AgentRuntime.lastSeen", {
                    at: intlStore.formatNumericalShortDateTime(new Date(runner.lastSeenAt)),
                  })
                : t("AgentRuntime.neverSeen");

              return (
                <li key={runner.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{runner.name}</span>

                    <span className="truncate text-xs text-muted-foreground">
                      {[runner.machine, seen].filter(Boolean).join(" · ")}
                    </span>
                  </span>

                  <AppChip size="sm" variant={runner.online ? "success" : "secondary"}>
                    {runner.online ? t("AgentRuntime.online") : t("AgentRuntime.offline")}
                  </AppChip>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
