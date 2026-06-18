import type { RootStore } from "../stores/root.store";

import { toast } from "sonner";

type ToastOptions = {
  values?: Record<string, unknown>;
  descriptionKey?: string;
};

export abstract class BaseStore {
  constructor(public readonly rootStore: RootStore) {}

  protected t = (key: string, values?: Record<string, unknown>): string =>
    this.rootStore.localeStore.getTranslation(key, values);

  protected toastSuccess = (key: string, options?: ToastOptions): void => {
    toast.success(this.t(key, options?.values), {
      description: options?.descriptionKey ? this.t(options.descriptionKey) : undefined,
    });
  };

  protected toastError = (key: string, options?: ToastOptions): void => {
    toast.error(this.t(key, options?.values), {
      description: options?.descriptionKey ? this.t(options.descriptionKey) : undefined,
    });
  };

  protected mountToast = (fire: () => void): (() => void) => {
    const id = setTimeout(fire);
    return () => clearTimeout(id);
  };
}
