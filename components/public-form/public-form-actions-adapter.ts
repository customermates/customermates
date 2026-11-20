import type { PublicFormTabActions } from "./public-form-tab.store";

import { getFormAutomationRulesAction, getPublicFormEditorAction, upsertPublicFormAction } from "@/app/actions";

export const publicFormTabActions: PublicFormTabActions = {
  loadEditor: (typeId) => getPublicFormEditorAction({ typeId }),
  save: (input) => upsertPublicFormAction(input),
  loadRules: () => getFormAutomationRulesAction(),
};
