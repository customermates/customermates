"use client";

import type { AgentJobPage, AgentJobStatusValue, AgentJobSummary } from "@/features/agent-jobs/agent-job.schema";

import { observer } from "mobx-react-lite";
import { useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";

import { agentRuntimeName } from "@/components/agent-keys/agent-labels";
import { AppChip } from "@/components/chip/app-chip";
import { SettingsPanel, SettingsPanelMessage } from "@/components/shared/settings-panel";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

import { AgentJobTranscript } from "./agent-job-transcript";
import { agentJobErrorLabel, agentJobStatusLabel } from "./agent-job-labels";

type Props = { page: AgentJobPage; sourceKind?: string; sourceId?: string };

const STATUS_DOT: Record<AgentJobStatusValue, string> = {
  queued: "bg-muted-foreground",
  claimed: "bg-info",
  running: "bg-info",
  succeeded: "bg-success",
  failed: "bg-destructive",
  timedOut: "bg-warning",
  cancelled: "bg-muted-foreground",
};

const AgentRunRow = observer(({ job }: { job: AgentJobSummary }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { agentRunsStore, agentRunnersStore } = useRootStore();
  const open = agentRunsStore.expandedId === job.id;
  const detail = open ? agentRunsStore.expanded : null;
  const panelId = `agent-run-${job.id}`;
  const failed = job.error !== null;
  const outcome = job.error ? agentJobErrorLabel(t, job.error) : (job.result?.text ?? null);
  const runnerName = job.runnerId
    ? agentRunnersStore.items.find((runner) => runner.id === job.runnerId)?.name
    : undefined;

  return (
    <li className="border-b last:border-b-0" data-agent-run={job.id} data-status={job.status}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
        type="button"
        onClick={() => runUserAction(() => agentRunsStore.toggle(job.id))}
      >
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[job.status])} />

        <span className="sr-only">{agentJobStatusLabel(t, job.status)}</span>

        <span className="flex min-w-0 flex-1 flex-col">
          {job.rule ? (
            <span className="truncate text-sm" data-agent-run-rule={job.rule.id}>
              {job.rule.name}
            </span>
          ) : (
            <span className="truncate text-sm">{agentRuntimeName(t, job.runtime)}</span>
          )}

          {outcome ? (
            <span
              className={cn("truncate text-xs", failed ? "text-destructive-soft-foreground" : "text-muted-foreground")}
            >
              {outcome}
            </span>
          ) : null}
        </span>

        <AppChip size="sm" variant="secondary">
          {runnerName ?? agentRuntimeName(t, job.runtime)}
        </AppChip>

        <span className="hidden w-28 shrink-0 text-end text-xs text-muted-foreground sm:block">
          {intlStore.formatNumericalShortDateTime(new Date(job.createdAt))}
        </span>
      </button>

      <div id={panelId} role="region">
        {open && agentRunsStore.loadingDetailId === job.id ? (
          <div className="px-4 pb-3">
            <Spinner aria-label={t("PageState.loading")} size="sm" />
          </div>
        ) : null}

        {detail ? (
          <div className="px-4 pb-3">
            <AgentJobTranscript job={detail} />
          </div>
        ) : null}
      </div>
    </li>
  );
});

export const AgentRunsCard = observer(({ page, sourceKind, sourceId }: Props) => {
  const t = useTranslations();
  const { agentRunsStore } = useRootStore();

  useState(() => agentRunsStore.setPage(page, { sourceKind, sourceId }));
  useLayoutEffect(
    () => agentRunsStore.setPage(page, { sourceKind, sourceId }),
    [agentRunsStore, page, sourceKind, sourceId],
  );

  return (
    <SettingsPanel
      action={
        <Button asChild size="sm" variant="ghost">
          <IntlLink data-agent-runs-all="" href="/automations">
            {t("AgentsPage.allRuns")}

            <ArrowUpRight aria-hidden />
          </IntlLink>
        </Button>
      }
      id="agent-runs"
      title={t("AgentJobs.title")}
    >
      {agentRunsStore.items.length === 0 ? (
        <SettingsPanelMessage>{t("AgentJobs.empty")}</SettingsPanelMessage>
      ) : (
        <ul>
          {agentRunsStore.items.map((job) => (
            <AgentRunRow key={job.id} job={job} />
          ))}
        </ul>
      )}
    </SettingsPanel>
  );
});
