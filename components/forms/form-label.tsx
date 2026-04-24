"use client";

import type { ComponentProps } from "react";

import { observer } from "mobx-react-lite";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { useAppForm } from "./form-context";

export const FormLabel = observer(function FormLabel({ className, htmlFor, ...props }: ComponentProps<typeof Label>) {
  const store = useAppForm();
  const errors = htmlFor ? store?.getError(htmlFor) : undefined;
  const hasError = Array.isArray(errors) ? errors.length > 0 : Boolean(errors);

  return (
    <Label
      className={cn("gap-0 text-xs font-normal text-muted-foreground", hasError && "text-destructive", className)}
      htmlFor={htmlFor}
      {...props}
    />
  );
});
