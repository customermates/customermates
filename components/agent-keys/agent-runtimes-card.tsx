"use client";

import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";

import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_RUNTIMES } from "@/features/automation-rules/automation-rule.schema";

import { agentRuntimeName, agentRuntimeReasonLabel, agentRuntimeSummary } from "./agent-labels";

type Props = { availability: AgentRuntimeAvailability };

export function AgentRuntimesCard({ availability }: Props) {
  const t = useTranslations();

  return (
    <Card className="gap-3 py-4" id="agent-runtimes">
      <CardHeader className="flex flex-col gap-1 px-4">
        <CardTitle className="text-sm font-medium">{t("AgentRuntime.title")}</CardTitle>

        <p className="text-xs text-muted-foreground">{t("AgentRuntime.description")}</p>
      </CardHeader>

      <CardContent className="px-4">
        <ul className="flex flex-col divide-y divide-border">
          {AGENT_RUNTIMES.map((runtime) => {
            const option = availability[runtime];
            return (
              <li
                key={runtime}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                data-agent-runtime={runtime}
                data-available={option.available}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{agentRuntimeName(t, runtime)}</span>

                  <span className="text-xs text-muted-foreground">{agentRuntimeSummary(t, runtime)}</span>
                </span>

                <AppChip size="sm" variant={option.available ? "success" : "secondary"}>
                  {option.available ? t("AgentRuntime.available") : agentRuntimeReasonLabel(t, option.reason)}
                </AppChip>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
