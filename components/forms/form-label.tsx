"use client";

import type { ComponentProps } from "react";

import { observer } from "mobx-react-lite";

import { Label } from "@/components/ui/label";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";

type Props = ComponentProps<typeof Label> & {
  fieldId?: string;
};

export const FormLabel = observer(({ className, htmlFor, fieldId, ...props }: Props) => {
  const store = useAppForm();
  const errorKey = fieldId ?? htmlFor;
  const errors = errorKey ? store?.getError(errorKey) : undefined;
  const hasError = Array.isArray(errors) ? errors.length > 0 : Boolean(errors);

  return (
    <Label
      className={cn("gap-0 text-xs font-normal text-muted-foreground", hasError && "text-destructive", className)}
      htmlFor={htmlFor}
      {...props}
    />
  );
});
