"use client";

import * as React from "react";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/core/utils/cn";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input bg-input-background shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 aria-[readonly=true]:cursor-default aria-[readonly=true]:shadow-none disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-muted-foreground disabled:shadow-none disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-inset data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary dark:data-[state=indeterminate]:bg-primary",
        className,
      )}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="group/indicator grid place-content-center text-current transition-none"
        data-slot="checkbox-indicator"
      >
        <CheckIcon className="size-3.5 group-data-[state=indeterminate]/indicator:hidden" />

        <MinusIcon className="hidden size-3.5 group-data-[state=indeterminate]/indicator:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
