import type { RootStore } from "@/core/stores/root.store";

import { BaseModalStore } from "@/core/base/base-modal.store";

export class AddPickerStore extends BaseModalStore {
  constructor(rootStore: RootStore) {
    super(rootStore, {});
  }
}
