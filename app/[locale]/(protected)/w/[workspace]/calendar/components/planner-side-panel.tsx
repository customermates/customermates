"use client";

import type { ReactNode } from "react";
import type { AppModalActions } from "@/components/modal/app-modal";

import { AppModal } from "@/components/modal/app-modal";
import { cn } from "@/core/utils/cn";

type Props = {
  title: string;
  onClose: () => void;
  actions?: AppModalActions;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
} & Record<`data-${string}`, string>;

export function PlannerSidePanel({ title, onClose, actions, children, className, bodyClassName, ...data }: Props) {
  return (
    <AppModal
      focusContentOnOpen
      open
      sheet
      visibleTitle
      actions={actions}
      bodyClassName="flex flex-col pr-[var(--safe-right)] pb-[var(--safe-bottom)] pl-[var(--safe-left)]"
      layerClassName={cn("bg-card sm:max-w-[440px]", className)}
      title={title}
      onClose={onClose}
    >
      <div {...data} className={cn("flex min-h-0 flex-col", bodyClassName)}>
        {children}
      </div>
    </AppModal>
  );
}
