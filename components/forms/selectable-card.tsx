"use client";

import type { ComponentProps, ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/core/utils/cn";

type BaseProps = {
  description?: string;
  disabled?: boolean;
  id: string;
  label: string;
  labelClassName?: string;
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

export function SelectableCard(props: Props) {
  const { description, disabled, id, label, labelClassName, selectionMode, visual } = props;
  const controlClassName = "peer absolute left-3 top-3 z-10";
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
          "interactive-surface flex h-full cursor-pointer flex-col items-start gap-1 rounded-md border border-input bg-input-background py-2.5 pl-10 pr-3 text-left shadow-xs",
          "peer-data-[state=checked]:bg-primary/5",
          "peer-data-[state=indeterminate]:bg-primary/5",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
          labelClassName,
        )}
        htmlFor={id}
      >
        <span className="text-sm font-medium text-foreground">{label}</span>

        {description ? (
          <span className="text-xs font-normal leading-relaxed text-muted-foreground">{description}</span>
        ) : null}

        {visual}
      </Label>
    </div>
  );
}
