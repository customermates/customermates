import type { AiConnectionCredential, AiConnectionCreateResult } from "./ai-connection.store";

import { toast } from "sonner";

import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type ExecuteKeyCreationArgs = {
  createKey: () => Promise<AiConnectionCreateResult>;
  failureMessage: string;
  onKeyCreated?: (credential: AiConnectionCredential) => Promise<void> | void;
};

export async function executeAiConnectionKeyCreation({
  createKey,
  failureMessage,
  onKeyCreated,
}: ExecuteKeyCreationArgs): Promise<AiConnectionCreateResult> {
  const result = await createKey();
  if (result.status === "failed") {
    if (!result.error || !toastZodErrorTree(result.error)) toast.error(failureMessage);
    return result;
  }
  if (result.status === "created") await onKeyCreated?.(result.credential);
  return result;
}
