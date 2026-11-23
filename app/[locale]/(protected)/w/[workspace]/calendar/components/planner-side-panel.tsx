"use client";

import type { ReactNode } from "react";

import { AppModal } from "@/components/modal/app-modal";
import { cn } from "@/core/utils/cn";

type Props = {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
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
      bodyClassName="flex flex-col px-0 pb-[var(--safe-bottom)]"
      controls={actions ? { node: actions, slots: 1 } : undefined}
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
