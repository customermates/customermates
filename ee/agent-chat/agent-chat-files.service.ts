import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RecordFileAccessService } from "@/features/record-files/record-file-access.service";
import type { RecordChatFileRepo } from "@/features/records/record-chat-file.repo";
import type { AgentContextAttachment } from "./agent-context";
import type { AgentFileExcerpt } from "./agent-attachments";
import type { AgentTurnFile } from "./agent-native-files";

import { UserAccessor } from "@/core/base/user-accessor";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { isAgentFileContext } from "./agent-context";

export class AgentChatFileService extends UserAccessor {
  constructor(
    private access: Pick<RecordFileAccessService, "readable">,
    private files: RecordChatFileRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  async resolve(
    contexts: readonly AgentContextAttachment[],
    conversationId: string | null,
  ): Validated<AgentTurnFile[]> {
    const resolved: AgentTurnFile[] = [];
    for (const [index, context] of contexts.entries()) {
      if (!isAgentFileContext(context)) continue;
      const readable = await runInTransaction(
        async () => ({ ok: true as const, data: await this.access.readable(context.reference.fileId) }),
        { readOnly: true },
      ).catch(unwoundFailure);
      const file = readable.ok ? readable.data : null;
      const chatFile =
        file !== null &&
        file.fieldId === null &&
        file.status === "pending" &&
        file.extractionStatus !== "pending" &&
        (file.conversationId === null || file.conversationId === conversationId);
      if (!file || (file.status !== "ready" && !chatFile))
        return failNotFound(CustomErrorCode.recordFileNotFound, ["contexts", index, "reference", "fileId"]);
      resolved.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        extractionStatus: file.extractionStatus,
        pageCount: file.pageCount,
      });
    }
    return { ok: true, data: resolved };
  }

  async excerpts(fileIds: string[], maxChars: number): Promise<Map<string, AgentFileExcerpt>> {
    const rows = await this.files.fileTextExcerpts(fileIds, maxChars);
    return new Map(rows.map((row) => [row.id, { text: row.text, totalChars: row.totalChars }]));
  }

  async bind(conversationId: string, fileIds: string[]): Promise<void> {
    await this.files.bindChatFiles(conversationId, fileIds);
  }

  async expireConversation(conversationId: string): Promise<void> {
    if (!(await this.files.expireConversationChatFiles(conversationId))) return;
    await this.background.dispatch("purge-record-files", { companyId: this.companyId, now: new Date().toISOString() });
  }
}
