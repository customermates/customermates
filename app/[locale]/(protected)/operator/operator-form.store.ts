import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable } from "mobx";

import { BaseFormStore } from "@/core/base/base-form.store";

export type OperatorActionErrorCode =
  | "accessDenied"
  | "conflict"
  | "invalidInput"
  | "notFound"
  | "unavailable"
  | "unexpected";

export type OperatorActionState<T> =
  | { status: "idle"; data?: never; errorCode?: never; operationId?: string }
  | { status: "success"; data: T; errorCode?: never; operationId?: string }
  | { status: "error"; data?: never; errorCode: OperatorActionErrorCode; operationId?: string };

export function operatorErrorKey(code: OperatorActionErrorCode): string {
  if (code === "accessDenied") return "OperatorConsole.errors.accessDenied";
  if (code === "conflict") return "OperatorConsole.errors.conflict";
  if (code === "invalidInput") return "OperatorConsole.errors.invalidInput";
  if (code === "notFound") return "OperatorConsole.errors.notFound";
  if (code === "unavailable") return "OperatorConsole.errors.unavailable";

  return "OperatorConsole.errors.unexpected";
}

export abstract class OperatorFormStore<TForm extends object, TResult> extends BaseFormStore<TForm> {
  private operationId: string | null = null;

  constructor(rootStore: RootStore, initialState: TForm) {
    super(rootStore, initialState);
    this.withUnsavedChangesGuard = false;

    makeObservable(this, { onSubmit: action });
  }

  get isBlocked(): boolean {
    return false;
  }

  protected abstract submit(operationId: string): Promise<OperatorActionState<TResult>>;

  protected abstract onSuccess(data: TResult): void;

  protected onConflict(): void {}

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isDisabled || this.isBlocked) return;

    this.setIsLoading(true);

    try {
      const result = await this.submit(this.currentOperationId());

      if (result.status === "success") {
        this.operationId = null;
        this.onSuccess(result.data);
        return;
      }

      if (result.status !== "error") return;

      if (result.errorCode === "conflict") this.onConflict();
      this.toastError(operatorErrorKey(result.errorCode));
    } finally {
      this.setIsLoading(false);
    }
  };

  private currentOperationId(): string {
    if (!this.operationId) this.operationId = globalThis.crypto.randomUUID();

    return this.operationId;
  }
}
