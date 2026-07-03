import type { RootStore } from "../stores/root.store";

import { toast } from "sonner";

type ToastOptions = {
  values?: Record<string, unknown>;
  descriptionKey?: string;
  action?: { labelKey: string; href: string };
};

export abstract class BaseStore {
  constructor(public readonly rootStore: RootStore) {}

  protected t = (key: string, values?: Record<string, unknown>): string =>
    this.rootStore.localeStore.getTranslation(key, values);

  private toastData = (options?: ToastOptions) => {
    const action = options?.action;
    return {
      description: options?.descriptionKey ? this.t(options.descriptionKey) : undefined,
      action: action
        ? { label: this.t(action.labelKey), onClick: () => window.open(action.href, "_blank", "noopener,noreferrer") }
        : undefined,
    };
  };

  protected toastSuccess = (key: string, options?: ToastOptions): void => {
    toast.success(this.t(key, options?.values), this.toastData(options));
  };

  protected toastError = (key: string, options?: ToastOptions): void => {
    toast.error(this.t(key, options?.values), this.toastData(options));
  };

  protected mountToast = (fire: () => void): (() => void) => {
    const id = setTimeout(fire);
    return () => clearTimeout(id);
  };
}
