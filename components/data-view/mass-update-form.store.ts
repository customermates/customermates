import type { RootStore } from "@/core/stores/root.store";

import { BaseFormStore } from "@/core/base/base-form.store";

export type MassUpdateFormState = {
  customFieldValues: { columnId: string; value: string | undefined }[];
};

export const MASS_UPDATE_VALUE_PATH = "customFieldValues[0].value";

export class MassUpdateFormStore extends BaseFormStore<MassUpdateFormState> {
  constructor(rootStore: RootStore, columnId: string) {
    super(rootStore, { customFieldValues: [{ columnId, value: undefined }] });
    this.setWithUnsavedChangesGuard(false);
  }

  get value(): string | undefined {
    return this.form.customFieldValues[0]?.value;
  }
}
