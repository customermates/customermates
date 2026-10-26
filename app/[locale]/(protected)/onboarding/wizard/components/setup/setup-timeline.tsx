"use client";

import type { ReactNode } from "react";
import type { ActivityTimelineStatus } from "@/components/shared/activity-timeline";

import { useActivityGroupState } from "@/app/components/agent-chat/use-activity-group-state";
import { ActivityTimeline, ActivityTimelineRow } from "@/components/shared/activity-timeline";

export type SetupTimelineRow = { key: string; status: ActivityTimelineStatus; label: ReactNode };

type Props = {
  action?: ReactNode;
  rows: SetupTimelineRow[];
  status: ActivityTimelineStatus;
  summary: string;
};

export function SetupTimeline({ action, rows, status, summary }: Props) {
  const running = status === "running";
  const failed = status === "error";
  const { open, setOpen } = useActivityGroupState({ hasRunning: running, hasError: failed, isWorking: running });

  return (
    <>
      <ActivityTimeline
        action={action}
        destructive={failed}
        hasDetails={rows.length > 1 || rows.some((row) => row.status === "error")}
        open={open}
        status={status}
        summary={summary}
        testId="setup-timeline"
        onOpenChange={setOpen}
      >
        {rows.map((row) => (
          <ActivityTimelineRow key={row.key} status={row.status}>
            {row.label}
          </ActivityTimelineRow>
        ))}
      </ActivityTimeline>

      <span aria-live="polite" className="sr-only" role="status">
        {summary}
      </span>
    </>
  );
}
