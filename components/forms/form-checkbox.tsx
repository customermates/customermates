"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";

import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "./form-label";
import { cn } from "@/lib/utils";

import { useAppForm } from "./form-context";

type Props = {
  id: string;
  label?: ReactNode;
  required?: boolean;
  className?: string;
  containerClassName?: string;
};

export const FormCheckbox = observer(({ id, label, required, className, containerClassName }: Props) => {
  const store = useAppForm();
  const checked = Boolean(store?.getValue(id));
  const errors = store?.getError(id);
  const hasError = Array.isArray(errors) ? errors.length > 0 : Boolean(errors);

  return (
    <div className={cn("space-y-1.5", containerClassName)}>
      <div className="flex items-center gap-2">
        <Checkbox
          aria-invalid={hasError}
          checked={checked}
          className={className}
          disabled={store?.isDisabled}
          id={id}
          onCheckedChange={(next) => store?.onChange(id, next === true)}
        />

        {label && (
          <FormLabel htmlFor={id}>
            <span>
              {label}

              {required ? <span className="text-destructive"> *</span> : null}
            </span>
          </FormLabel>
        )}
      </div>
    </div>
  );
});
