import type { ModelIssue } from "./record-model-validation";

import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export function invalidConfigurationFailure(issues: ModelIssue[]) {
  if (issues.some((issue) => issue.code === "nested_sublist")) return fail(CustomErrorCode.recordSublistNested);
  const view = issues.find((issue) => issue.code === "saved_view_incompatible" && issue.viewId);
  if (!view?.viewId) return fail(CustomErrorCode.recordConfigurationInvalid);
  return fail(CustomErrorCode.recordSavedViewIncompatible, [], {
    viewId: view.viewId,
    viewName: view.viewName ?? view.viewId,
    columnId: view.columnId ?? "",
    columnLabel: view.columnLabel ?? view.columnId ?? "",
  });
}
