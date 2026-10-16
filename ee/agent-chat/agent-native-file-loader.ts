import type { FileStorageDrivers } from "@/core/storage/file-storage-drivers";
import type { RecordFileAccessService } from "@/features/record-files/record-file-access.service";
import type { AgentNativeFile } from "./agent-native-files";
import type { ReplayMessage } from "./agent-stream-utils";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { readCappedStream } from "@/core/storage/read-capped-stream";

import { markAgentNativeFileUnavailable } from "./agent-attachments";
import { AGENT_NATIVE_FILE_MAX_BYTES } from "./agent-native-files";

export class AgentNativeFileLoader {
  constructor(
    private access: Pick<RecordFileAccessService, "readable">,
    private drivers: FileStorageDrivers,
  ) {}

  async load(messages: readonly ReplayMessage[]): Promise<ReplayMessage[]> {
    const loaded: ReplayMessage[] = [];
    for (const message of messages) {
      if (!message.files?.length) {
        loaded.push(message);
        continue;
      }
      const files: AgentNativeFile[] = [];
      let attachedText = message.attachedText ?? "";
      for (const file of message.files) {
        const data = await this.read(file).catch(() => null);
        if (data) files.push({ ...file, data });
        else attachedText = markAgentNativeFileUnavailable(attachedText, file.fileId);
      }
      loaded.push({ ...message, ...(attachedText ? { attachedText } : {}), files });
    }
    return loaded;
  }

  private async read(file: AgentNativeFile): Promise<string | null> {
    const stored = await runInTransaction(() => this.access.readable(file.fileId), { readOnly: true });
    if (stored.mimeType !== file.mediaType || stored.size > AGENT_NATIVE_FILE_MAX_BYTES) return null;
    const content = await this.drivers(stored.storageDriver).read(stored.storageKey);
    if (!content) return null;
    const bytes = await readCappedStream(content.stream, AGENT_NATIVE_FILE_MAX_BYTES);
    return bytes.ok && bytes.bytes.byteLength > 0 ? Buffer.from(bytes.bytes).toString("base64") : null;
  }
}
