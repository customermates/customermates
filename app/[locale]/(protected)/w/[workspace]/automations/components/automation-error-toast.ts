import { toast } from "sonner";

import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export const AUTOMATION_ERROR_TOAST_ID = "automation-builder-error";

export function showAutomationError(message: string): void {
  toast.error(message, { id: AUTOMATION_ERROR_TOAST_ID });
}

export function showAutomationSaveError(tree: unknown): void {
  toastZodErrorTree(tree, { id: AUTOMATION_ERROR_TOAST_ID });
}

export function dismissAutomationError(): void {
  toast.dismiss(AUTOMATION_ERROR_TOAST_ID);
}
