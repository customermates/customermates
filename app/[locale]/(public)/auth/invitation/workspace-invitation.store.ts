import type { RootStore } from "@/core/stores/root.store";

import { BaseFormStore } from "@/core/base/base-form.store";

export type WorkspaceInvitationForm = { agreeToTerms: boolean };

export class WorkspaceInvitationStore extends BaseFormStore<WorkspaceInvitationForm> {
  constructor(rootStore: RootStore) {
    super(rootStore, { agreeToTerms: false });
    this.setWithUnsavedChangesGuard(false);
  }
}
