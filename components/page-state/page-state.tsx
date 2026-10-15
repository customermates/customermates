import type { ReactElement, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { CircleAlert } from "lucide-react";

import { cn } from "@/core/utils/cn";

type SharedProps = {
  className?: string;
};

type PageBackground = { background: ReactElement };

type EmptyProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
};

export type PageStateProps =
  | (SharedProps &
      PageBackground & {
        state: "loading";
        label: string;
      })
  | (SharedProps & EmptyProps & { state: "empty"; background?: ReactElement })
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
          <div data-page-state-background aria-hidden="true" className="size-full min-h-0">
            {props.background}
          </div>
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

  if (!props.background) {
    return (
      <section
        className={cn(
          "flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 py-10 text-center",
          props.className,
        )}
        data-page-state="empty"
        role="status"
      >
        <EmptyContent {...props} />
      </section>
    );
  }

  return (
    <section className={cn("relative min-h-0 w-full flex-1 overflow-hidden", props.className)} data-page-state="empty">
      <div data-page-state-background aria-hidden="true" className="pointer-events-none size-full min-h-0">
        {props.background}
      </div>

      <div
        data-page-state-overlay
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4 md:p-6"
      >
        <EmptyContent
          {...props}
          className="animate-page-empty-in pointer-events-none relative isolate before:pointer-events-none before:absolute before:-inset-x-24 before:-inset-y-16 before:-z-10 before:bg-radial-[closest-side] before:from-background before:from-55% before:to-transparent motion-reduce:animate-none"
        />
      </div>
    </section>
  );
}

function EmptyContent({ title, description, icon: Icon, action, className }: EmptyProps & SharedProps) {
  return (
    <div
      data-page-state-content
      className={cn("flex w-full max-w-sm flex-col items-center gap-3 text-center", className)}
    >
      {Icon && <Icon data-page-state-icon aria-hidden="true" className="size-6 text-muted-foreground" />}

      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>

        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      {action && (
        <div data-page-state-action className="pointer-events-auto pt-1">
          {action}
        </div>
      )}
    </div>
  );
}
