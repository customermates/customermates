import type { ReactNode } from "react";

import { CircleAlert } from "lucide-react";

import { cn } from "@/core/utils/cn";

import { PageSkeleton, type PageSkeletonSpec } from "./page-skeleton";

type SharedProps = {
  className?: string;
};

export type PageStateProps =
  | (SharedProps & {
      state: "loading";
      skeleton: PageSkeletonSpec;
      label: string;
    })
  | (SharedProps & {
      state: "empty";
      skeleton: PageSkeletonSpec;
      title: string;
      description?: string;
      action?: ReactNode;
    })
  | (SharedProps & {
      state: "error";
      title: string;
      description?: string;
      action?: ReactNode;
    });

export function PageState(props: PageStateProps) {
  if (props.state === "loading") {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        className={cn("size-full min-h-0 flex-1", props.className)}
        data-page-state="loading"
      >
        <span className="sr-only">{props.label}</span>

        <PageSkeleton spec={props.skeleton} />
      </section>
    );
  }

  if (props.state === "error") {
    return (
      <section
        className={cn(
          "flex min-h-80 w-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center",
          props.className,
        )}
        data-page-state="error"
        role="alert"
      >
        <CircleAlert aria-hidden="true" className="size-8 text-destructive" />

        <div className="flex max-w-md flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground">{props.title}</h2>

          {props.description && <p className="text-sm text-muted-foreground">{props.description}</p>}
        </div>

        {props.action && (
          <div data-page-state-action className="pt-1">
            {props.action}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={cn("relative min-h-80 w-full flex-1 overflow-hidden", props.className)} data-page-state="empty">
      <PageSkeleton
        data-page-state-background
        animated={false}
        className="pointer-events-none opacity-45"
        spec={props.skeleton}
      />

      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
        <div className="pointer-events-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-background/95 px-6 py-5 text-center shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-foreground">{props.title}</h2>

            {props.description && <p className="text-sm text-muted-foreground">{props.description}</p>}
          </div>

          {props.action && (
            <div data-page-state-action className="pt-1">
              {props.action}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
