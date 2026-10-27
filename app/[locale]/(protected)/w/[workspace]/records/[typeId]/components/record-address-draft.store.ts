import type { RootStore } from "@/core/stores/root.store";
import type { AddressDraft } from "@/features/records/record-input-value";

import { BaseFormStore } from "@/core/base/base-form.store";
import { addressDraftParts } from "@/features/records/record-input-value";

export class RecordAddressDraftStore extends BaseFormStore<{ address: AddressDraft }> {
  constructor(
    root: RootStore,
    address: AddressDraft | undefined,
    errorFor: (path: string) => string | string[] | undefined,
  ) {
    super(root, { address: { ...addressDraftParts(address), ...address } });
    this.getError = errorFor;
  }
}
