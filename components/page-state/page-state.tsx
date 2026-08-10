import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

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
      icon?: LucideIcon;
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
      <section className={cn("size-full min-h-0 flex-1", props.className)} data-page-state="loading">
        <span className="sr-only" role="status">
          {props.label}
        </span>

        <div aria-busy="true" className="size-full min-h-0">
          <PageSkeleton spec={props.skeleton} />
        </div>
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

  const EmptyIcon = props.icon;

  return (
    <section className={cn("relative min-h-80 w-full flex-1 overflow-hidden", props.className)} data-page-state="empty">
      <PageSkeleton
        data-page-state-background
        animated={false}
        className="pointer-events-none opacity-45"
        spec={props.skeleton}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[calc(100svh-10rem)] min-h-80 max-h-[34rem] items-center justify-center p-4 md:p-6">
        <div className="pointer-events-none relative isolate flex w-full max-w-sm flex-col items-center gap-3 text-center before:pointer-events-none before:absolute before:-inset-12 before:-z-10 before:rounded-full before:bg-background/80 before:blur-2xl">
          {EmptyIcon && <EmptyIcon data-page-state-icon aria-hidden="true" className="size-6 text-muted-foreground" />}

          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-foreground">{props.title}</h2>

            {props.description && <p className="text-sm text-muted-foreground">{props.description}</p>}
          </div>

          {props.action && (
            <div data-page-state-action className="pointer-events-auto pt-1">
              {props.action}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
