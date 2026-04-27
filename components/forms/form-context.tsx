"use client";

import type { FormEvent, FormHTMLAttributes, ReactNode } from "react";
import type { BaseFormStore } from "@/core/base/base-form.store";

import { createContext, useContext } from "react";
import { observer } from "mobx-react-lite";

import { useNavigationGuard } from "@/components/modal/use-navigation-guard";
import { cn } from "@/lib/utils";

type AppFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  store: BaseFormStore;
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

const FormContext = createContext<BaseFormStore | null>(null);

export function useAppForm<T extends object = object>(): BaseFormStore<T> | null {
  return useContext(FormContext) as BaseFormStore<T> | null;
}

export const AppForm = observer(({ store, onSubmit, className, children, ...props }: AppFormProps) => {
  useNavigationGuard(store);

  const handleSubmit =
    onSubmit ??
    (store.onSubmit
      ? (event: FormEvent<HTMLFormElement>) => {
          void store.onSubmit?.(event);
        }
      : undefined);

  return (
    <FormContext.Provider value={store}>
      <form
        noValidate
        {...props}
        className={cn("contents", className)}
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit?.(event);
        }}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
});
