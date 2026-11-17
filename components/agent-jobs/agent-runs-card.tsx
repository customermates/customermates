"use client";

import type { AgentJobPage, AgentJobSummary } from "@/features/agent-jobs/agent-job.schema";

import { observer } from "mobx-react-lite";
import { useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";

import { agentRuntimeName } from "@/components/agent-keys/agent-labels";
import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { agentMicrocentsToCredits } from "@/core/commercial/agent-credits";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { AgentJobTranscript } from "./agent-job-transcript";
import { agentJobErrorLabel, agentJobStatusLabel } from "./agent-job-labels";
import { AGENT_JOB_STATUS_CHIP_COLOR } from "./agent-job-status-color";

type Props = { page: AgentJobPage; sourceKind?: string; sourceId?: string };

const AgentRunRow = observer(({ job }: { job: AgentJobSummary }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { agentRunsStore } = useRootStore();
  const open = agentRunsStore.expandedId === job.id;
  const detail = open ? agentRunsStore.expanded : null;
  const panelId = `agent-run-${job.id}`;

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-agent-run={job.id} data-status={job.status}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="flex w-full min-w-0 items-start gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        type="button"
        onClick={() => runUserAction(() => agentRunsStore.toggle(job.id))}
      >
        {open ? (
          <ChevronDown aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <AppChip size="sm" variant={AGENT_JOB_STATUS_CHIP_COLOR[job.status]}>
              {agentJobStatusLabel(t, job.status)}
            </AppChip>

            <span className="truncate text-sm font-medium">{agentRuntimeName(t, job.runtime)}</span>

            {job.model ? <span className="truncate text-xs text-muted-foreground">{job.model}</span> : null}
          </span>

          {job.rule ? (
            <span className="truncate text-xs" data-agent-run-rule={job.rule.id}>
              {t("AgentJobs.rule", { name: job.rule.name })}
            </span>
          ) : null}

          <span className="text-xs text-muted-foreground">
            {intlStore.formatNumericalShortDateTime(new Date(job.createdAt))}
          </span>

          {job.error ? <span className="text-xs text-destructive">{agentJobErrorLabel(t, job.error)}</span> : null}

          {job.result?.text ? <span className="line-clamp-2 text-xs">{job.result.text}</span> : null}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground tabular-nums">
          {job.inputTokens !== null && job.outputTokens !== null ? (
            <span>
              {t("AgentJobs.tokens", {
                input: intlStore.formatNumber(job.inputTokens),
                output: intlStore.formatNumber(job.outputTokens),
              })}
            </span>
          ) : null}

          {job.costMicrocents !== null ? (
            <span>
              {t("AgentJobs.credits", {
                credits: intlStore.formatNumber(agentMicrocentsToCredits(job.costMicrocents), {
                  maximumFractionDigits: 2,
                }),
              })}
            </span>
          ) : null}
        </span>
      </button>

      <div className="pl-6" id={panelId} role="region">
        {open && agentRunsStore.loadingDetailId === job.id ? (
          <Spinner aria-label={t("PageState.loading")} size="sm" />
        ) : null}

        {detail ? <AgentJobTranscript job={detail} /> : null}
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
    <Card className="gap-3 py-4" id="agent-runs">
      <CardHeader className="flex flex-col gap-1 px-4">
        <CardTitle className="text-sm font-medium">{t("AgentJobs.title")}</CardTitle>

        <p className="text-xs text-muted-foreground">{t("AgentJobs.description")}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4">
        {agentRunsStore.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("AgentJobs.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {agentRunsStore.items.map((job) => (
              <AgentRunRow key={job.id} job={job} />
            ))}
          </ul>
        )}

        {agentRunsStore.hasMore ? (
          <Button
            className="self-start"
            disabled={agentRunsStore.loadingMore}
            size="sm"
            variant="secondary"
            onClick={() => runUserAction(() => agentRunsStore.loadMore())}
          >
            {t("Common.actions.loadMore")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
});
