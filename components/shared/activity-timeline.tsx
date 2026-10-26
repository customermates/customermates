"use client";

import type { ReactNode } from "react";

import { Check, ChevronDown, Loader2, Square, X } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/core/utils/cn";

export type ActivityTimelineStatus = "running" | "done" | "error" | "cancelled";

export const ACTIVITY_TIMELINE_LINE_CLASS = cn(
  "before:absolute before:top-0 before:-left-4 before:w-px before:bg-border",
  "before:origin-top before:animate-timeline-grow before:motion-reduce:animate-none",
);

function ActivityStatusIcon({ className, status }: { className?: string; status: ActivityTimelineStatus }) {
  if (status === "running")
    return <Loader2 aria-hidden="true" className={cn("size-3.5 animate-spin motion-reduce:animate-none", className)} />;
  if (status === "error") return <X aria-hidden="true" className={cn("size-3.5", className)} />;
  if (status === "cancelled") return <Square aria-hidden="true" className={cn("size-3.5", className)} />;
  return <Check aria-hidden="true" className={cn("size-3.5", className)} />;
}

type TimelineProps = {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  destructive?: boolean;
  hasDetails: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  status: ActivityTimelineStatus;
  summary: ReactNode;
  testId?: string;
};

export function ActivityTimeline({
  action,
  children,
  className,
  destructive = false,
  hasDetails,
  onOpenChange,
  open,
  status,
  summary,
  testId,
}: TimelineProps) {
  const statusIcon = (
    <ActivityStatusIcon className={status === "error" ? "text-destructive" : undefined} status={status} />
  );

  return (
    <Collapsible
      aria-live="off"
      className={cn("group py-1", className)}
      data-testid={testId}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="flex items-center gap-1">
        {hasDetails ? (
          <CollapsibleTrigger asChild>
            <button
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-xs text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
              type="button"
            >
              {statusIcon}

              <span className="min-w-0 flex-1 text-left [overflow-wrap:anywhere]">{summary}</span>

              <ChevronDown
                aria-hidden="true"
                className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
              />
            </button>
          </CollapsibleTrigger>
        ) : (
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground",
              destructive && "text-destructive",
            )}
          >
            {statusIcon}

            <span className="min-w-0 flex-1 text-left [overflow-wrap:anywhere]">{summary}</span>
          </div>
        )}

        {action}
      </div>

      {hasDetails && (
        <CollapsibleContent className="mt-3 space-y-3 pl-4 [&>*]:fade-in-0 [&>*]:slide-in-from-top-2 [&>*]:animate-in [&>*]:duration-300 [&>*]:motion-reduce:animate-none">
          {children}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export function ActivityTimelineRow({ children, status }: { children: ReactNode; status: ActivityTimelineStatus }) {
  return (
    <div
      className={cn(
        "relative flex gap-2 text-xs",
        ACTIVITY_TIMELINE_LINE_CLASS,
        "before:h-[calc(100%+0.75rem)] last:before:h-full",
        status === "error" && "text-destructive",
      )}
    >
      <ActivityStatusIcon className="mt-0.5 shrink-0" status={status} />

      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}
