"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/core/utils/cn";

type Props = {
  id: string;
  value: string;
  title: string;
  description: string;
  badge?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  selected: boolean;
};

export function SetupChoiceCard({ id, value, title, description, badge, leading, children, disabled, selected }: Props) {
  return (
    <div className="relative min-w-0">
      <RadioGroupItem className="peer absolute top-4 left-4 z-10" disabled={disabled} id={id} value={value} />

      <Label
        className={cn(
          "interactive-surface flex h-full min-w-0 max-w-full cursor-pointer flex-col items-start gap-3 rounded-xl border bg-input-background py-4 pr-4 pl-12 text-left shadow-xs *:max-w-full",
          selected ? "border-2 border-primary bg-primary/5 py-[15px] pr-[15px] pl-[47px]" : "border-input",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
        )}
        htmlFor={id}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {leading}

          <span className="min-w-0 text-sm leading-snug font-semibold wrap-anywhere text-foreground">{title}</span>

          {badge}
        </span>

        <span className="text-sm font-normal leading-relaxed text-muted-foreground">{description}</span>

        {children}
      </Label>
    </div>
  );
}
