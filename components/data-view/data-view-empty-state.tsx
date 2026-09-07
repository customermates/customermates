"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";

export type EmptyStateAction = {
  label: string;
  onClick: () => void;
};

type Props = {
  icon?: LucideIcon;
  title: string;
  body?: string;
  children?: ReactNode;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
};

export function DataViewEmptyState({
  icon: Icon = Inbox,
  title,
  body,
  children,
  primaryAction,
  secondaryAction,
}: Props) {
  return (
    <div
      className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center"
      data-slot="empty-state"
      role="status"
    >
      <Icon aria-hidden="true" className="size-8 opacity-40" />

      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>

        {body && <p className="text-sm">{body}</p>}
      </div>

      {children}

      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {primaryAction && (
            <Button size="sm" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}

          {secondaryAction && (
            <Button size="sm" variant="secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
