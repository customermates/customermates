"use client";

import type { AgentRuntimeKind } from "@/features/automation-rules/automation-rule.schema";
import type { AgentRuntimeStatus } from "./agent-runtime-status";

import { useTranslations } from "next-intl";
import { KeyRound, Laptop } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { MateOrb } from "@/components/mate/mate-orb";
import { AGENT_RUNTIMES } from "@/features/automation-rules/automation-rule.schema";
import { cn } from "@/core/utils/cn";

import { agentRuntimeName, agentRuntimeReasonLabel, agentRuntimeSummary } from "./agent-labels";
import { agentRuntimeStatusVariant } from "./agent-runtime-status";

type Props = {
  selected: AgentRuntimeKind;
  statuses: Record<AgentRuntimeKind, AgentRuntimeStatus>;
  onSelect: (runtime: AgentRuntimeKind) => void;
};

function RuntimeIcon({ runtime }: { runtime: AgentRuntimeKind }) {
  if (runtime === "mate") return <MateOrb className="size-10" />;
  const Icon = runtime === "ownKey" ? KeyRound : Laptop;
  return (
    <span className="flex size-10 items-center justify-center rounded-xl border bg-card shadow-xs">
      <Icon aria-hidden className="size-5" />
    </span>
  );
}

export function AgentRuntimeCards({ selected, statuses, onSelect }: Props) {
  const t = useTranslations();

  function statusLabel(status: AgentRuntimeStatus) {
    switch (status.kind) {
      case "available":
        return t("AgentRuntime.available");
      case "keys":
        return t("AgentsPage.keyCount", { count: status.count });
      case "online":
        return t("AgentsPage.onlineCount", { count: status.count });
      case "offline":
        return t("Runners.status.offline");
      case "unavailable":
        return agentRuntimeReasonLabel(t, status.reason);
    }
  }

  return (
    <section aria-labelledby="agent-runtimes-title" className="flex flex-col gap-3" id="agent-runtimes">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-x-lg" id="agent-runtimes-title">
          {t("AgentsPage.title")}
        </h2>

        <p className="text-sm text-muted-foreground">{t("AgentsPage.description")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {AGENT_RUNTIMES.map((runtime) => {
          const status = statuses[runtime];
          const active = selected === runtime;
          return (
            <button
              key={runtime}
              aria-pressed={active}
              className={cn(
                "flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active && "border-ring/60 ring-[3px] ring-ring/10",
              )}
              data-agent-runtime={runtime}
              data-status={status.kind}
              type="button"
              onClick={() => onSelect(runtime)}
            >
              <span className="flex items-start justify-between gap-2">
                <RuntimeIcon runtime={runtime} />

                <AppChip size="sm" variant={agentRuntimeStatusVariant(status)}>
                  {statusLabel(status)}
                </AppChip>
              </span>

              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{agentRuntimeName(t, runtime)}</span>

                <span className="text-xs text-muted-foreground">{agentRuntimeSummary(t, runtime)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
