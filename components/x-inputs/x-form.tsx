"use client";

import type { FormProps } from "@heroui/form";
import type { BaseFormStore } from "@/core/base/base-form.store";

import { Form } from "@heroui/form";
import { observer } from "mobx-react-lite";
import { createContext, useContext } from "react";

type Props = FormProps & {
  store: BaseFormStore;
};

export const XFormContext = createContext<BaseFormStore | null>(null);

export function useXForm<T extends object = object>(): BaseFormStore<T> | null {
  return useContext(XFormContext) as BaseFormStore<T> | null;
}

export const XForm = observer(({ store, onSubmit, ...props }: Props) => {
  const handleSubmit = onSubmit ?? (store.onSubmit ? (event) => void store.onSubmit?.(event) : undefined);

  return (
    <XFormContext.Provider value={store}>
      <Form {...props} className="contents" validationBehavior="aria" onSubmit={handleSubmit} />
    </XFormContext.Provider>
  );
});
