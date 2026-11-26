"use client";

import type { ComponentProps, ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/core/utils/cn";

type BaseProps = {
  badge?: ReactNode;
  centeredControl?: boolean;
  description?: string;
  disabled?: boolean;
  eyebrow?: ReactNode;
  id: string;
  label: string;
  labelClassName?: string;
  leading?: ReactNode;
  visual?: ReactNode;
};

type CheckboxCardProps = BaseProps & {
  checked: boolean | "indeterminate";
  selectionMode: "multiple";
  onCheckedChange: (checked: boolean) => void;
};

type RadioCardProps = BaseProps & {
  selectionMode: "single";
  value: string;
};

type Props = CheckboxCardProps | RadioCardProps;

const DESCRIPTION_CLASS = "text-xs font-normal leading-relaxed text-muted-foreground";
const EYEBROW_CLASS = "text-[11px] font-medium tracking-wide text-muted-foreground uppercase";

export function SelectableCard(props: Props) {
  const {
    badge,
    centeredControl,
    description,
    disabled,
    eyebrow,
    id,
    label,
    labelClassName,
    leading,
    selectionMode,
    visual,
  } = props;
  const controlClassName = cn("peer absolute left-3 z-10", centeredControl ? "top-1/2 -translate-y-1/2" : "top-3");
  const name = (
    <span className="min-w-0 max-w-full text-sm leading-snug font-medium wrap-anywhere text-foreground">{label}</span>
  );
  const title = badge ? (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {name}

      {badge}
    </span>
  ) : (
    name
  );
  const control =
    selectionMode === "single" ? (
      <RadioGroupItem className={controlClassName} disabled={disabled} id={id} value={props.value} />
    ) : (
      <Checkbox
        checked={props.checked}
        className={controlClassName}
        disabled={disabled}
        id={id}
        onCheckedChange={(checked: ComponentProps<typeof Checkbox>["checked"]) =>
          props.onCheckedChange(checked === true)
        }
      />
    );

  return (
    <div className="relative min-w-0">
      {control}

      <Label
        className={cn(
          "interactive-surface flex h-full min-w-0 max-w-full cursor-pointer flex-col items-start gap-1 rounded-md border border-input bg-input-background py-2.5 pl-10 pr-3 text-left shadow-xs *:max-w-full",
          "peer-data-[state=checked]:bg-primary/5",
          "peer-data-[state=indeterminate]:bg-primary/5",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
          labelClassName,
        )}
        htmlFor={id}
      >
        {eyebrow ? <span className={EYEBROW_CLASS}>{eyebrow}</span> : null}

        {leading ? (
          <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
            {leading}

            {title}

            {description ? <span className={cn("col-start-2", DESCRIPTION_CLASS)}>{description}</span> : null}
          </span>
        ) : (
          <>
            {title}

            {description ? <span className={DESCRIPTION_CLASS}>{description}</span> : null}
          </>
        )}

        {visual}
      </Label>
    </div>
  );
}
