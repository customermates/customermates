"use client";

import type { AgentJobDetail } from "@/features/agent-jobs/agent-job.schema";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { agentJobErrorLabel, agentJobStatusLabel } from "@/components/agent-jobs/agent-job-labels";
import { AGENT_JOB_STATUS_CHIP_COLOR } from "@/components/agent-jobs/agent-job-status-color";
import { AgentJobTranscript } from "@/components/agent-jobs/agent-job-transcript";
import { getAgentJobAction } from "@/components/agent-keys/agent-key-actions";
import { AppChip } from "@/components/chip/app-chip";
import { Spinner } from "@/components/ui/spinner";
import { reportApplicationError } from "@/core/errors/report-application-error";

const AGENT_JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RunStep = { kind: string; status: string; detail?: string | null };

export function agentJobIdOf(step: RunStep): string | null {
  if (step.kind !== "agent" || step.status !== "applied" || !step.detail) return null;
  return AGENT_JOB_ID.test(step.detail) ? step.detail : null;
}

type Loaded = { status: "idle" | "loading" | "failed" } | { status: "loaded"; job: AgentJobDetail };

export function AutomationRunAgentStep({ jobId }: { jobId: string }) {
  const t = useTranslations();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Loaded>({ status: "idle" });

  const toggle = () => {
    const opening = !open;
    setOpen(opening);
    if (!opening || state.status === "loaded" || state.status === "loading") return;
    setState({ status: "loading" });
    void getAgentJobAction({ id: jobId })
      .then((result) => setState(result.ok ? { status: "loaded", job: result.data } : { status: "failed" }))
      .catch((error: unknown) => {
        reportApplicationError(error);
        setState({ status: "failed" });
      });
  };

  return (
    <div className="flex flex-col gap-2" data-automation-run-agent={jobId}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="self-start rounded-sm text-xs underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        type="button"
        onClick={toggle}
      >
        {t("Automations.runs.agentRun")}
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-l border-border pl-3" id={panelId} role="region">
          {state.status === "loading" && <Spinner aria-label={t("PageState.loading")} size="sm" />}

          {state.status === "failed" && (
            <p className="text-xs text-destructive" role="alert">
              {t("AgentJobs.loadFailed")}
            </p>
          )}

          {state.status === "loaded" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <AppChip size="sm" variant={AGENT_JOB_STATUS_CHIP_COLOR[state.job.status]}>
                  {agentJobStatusLabel(t, state.job.status)}
                </AppChip>

                {state.job.error ? (
                  <span className="text-xs text-destructive">{agentJobErrorLabel(t, state.job.error)}</span>
                ) : null}
              </div>

              <AgentJobTranscript job={state.job} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
