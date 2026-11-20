"use client";

import type { AgentJobDetail, AgentTranscriptEvent } from "@/features/agent-jobs/agent-job.schema";

import { useTranslations } from "next-intl";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";

import { agentJobFinishLabel } from "./agent-job-labels";

type Props = { job: Pick<AgentJobDetail, "transcript" | "promptUntrusted" | "restricted"> };

function TranscriptEvent({ event }: { event: AgentTranscriptEvent }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const time = intlStore.formatTime(new Date(event.at));

  switch (event.type) {
    case "message":
      return (
        <div className="flex flex-col gap-0.5" data-transcript-event="message">
          <p className="text-xs text-muted-foreground">
            {`${event.role === "user" ? t("AgentJobs.transcript.user") : t("AgentJobs.transcript.assistant")} · ${time}`}
          </p>

          <p className="text-sm whitespace-pre-wrap">{event.text}</p>
        </div>
      );
    case "toolCall":
      return (
        <div className="flex flex-col gap-0.5" data-transcript-event="toolCall">
          <p className="text-xs text-muted-foreground">
            {`${t("AgentJobs.transcript.called", { name: event.name })} · ${time}`}
          </p>

          {event.argumentsDigest ? (
            <p className="font-mono text-xs break-words text-muted-foreground">{event.argumentsDigest}</p>
          ) : null}
        </div>
      );
    case "toolResult":
      return (
        <div className="flex flex-col gap-0.5" data-transcript-event="toolResult">
          <p className={cn("text-xs", event.ok ? "text-muted-foreground" : "text-destructive")}>
            {event.ok
              ? t("AgentJobs.transcript.result", { name: event.name })
              : t("AgentJobs.transcript.resultFailed", { name: event.name })}
          </p>

          {event.summary ? <p className="text-xs break-words">{event.summary}</p> : null}
        </div>
      );
    case "finish":
      return (
        <div className="flex flex-col gap-0.5" data-transcript-event="finish">
          <p className={cn("text-xs font-medium", event.reason === "stop" ? "text-foreground" : "text-destructive")}>
            {`${agentJobFinishLabel(t, event.reason)} · ${time}`}
          </p>

          {event.text ? <p className="text-sm whitespace-pre-wrap">{event.text}</p> : null}
        </div>
      );
  }
}

export function AgentJobTranscript({ job }: Props) {
  const t = useTranslations();

  if (job.restricted) {
    return (
      <p data-transcript-restricted className="text-xs text-muted-foreground">
        {t("AgentJobs.transcript.restricted")}
      </p>
    );
  }

  if (job.transcript.length === 0)
    return <p className="text-xs text-muted-foreground">{t("AgentJobs.transcript.empty")}</p>;

  return (
    <div className="flex flex-col gap-2">
      {job.promptUntrusted ? (
        <p className="text-xs text-muted-foreground">{t("AgentJobs.transcript.untrusted")}</p>
      ) : null}

      <ol aria-label={t("AgentJobs.transcript.label")} className="flex flex-col gap-3 border-l border-border pl-3">
        {job.transcript.map((event, index) => (
          <li key={`${event.at}-${index}`}>
            <TranscriptEvent event={event} />
          </li>
        ))}
      </ol>
    </div>
  );
}
