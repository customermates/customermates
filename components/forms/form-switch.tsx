"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";

import { Switch } from "@/components/ui/switch";
import { FormLabel } from "./form-label";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { useFormFieldErrors } from "./use-form-field";

type Props = {
  id: string;
  label?: ReactNode;
  required?: boolean;
  size?: "sm" | "default";
  className?: string;
  containerClassName?: string;
};

export const FormSwitch = observer(
  ({ id, label, required, size = "default", className, containerClassName }: Props) => {
    const store = useAppForm();
    const checked = Boolean(store?.getValue(id));
    const { hasError } = useFormFieldErrors(id);

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        <div className="flex items-center gap-2">
          <Switch
            aria-invalid={hasError}
            checked={checked}
            className={className}
            disabled={store?.isDisabled}
            id={id}
            size={size}
            onCheckedChange={(next) => store?.onChange(id, next)}
          />

          {label && (
            <FormLabel htmlFor={id}>
              {label}

              {required ? <span className="text-destructive">&nbsp;*</span> : null}
            </FormLabel>
          )}
        </div>
      </div>
    );
  },
);
