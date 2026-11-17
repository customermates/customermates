import type { PublicFormTabActions } from "./public-form-tab.store";

import { getPublicFormEditorAction, upsertPublicFormAction } from "@/app/actions";

import { getFormAutomationRulesAction } from "./public-form-rules-actions";

export const publicFormTabActions: PublicFormTabActions = {
  loadEditor: (typeId) => getPublicFormEditorAction({ typeId }),
  save: (input) => upsertPublicFormAction(input),
  loadRules: () => getFormAutomationRulesAction(),
};
