import type { FileContentRepo } from "./file-content.repo";
import type {
  FileStorageDriver,
  FileUploadRequest,
  FileUploadTarget,
  StoredFileHead,
  StoredFileRange,
  StoredFileRead,
  StoredFileWrite,
} from "./file-storage-driver";

import { createHash } from "node:crypto";

import { FILE_STORAGE_PART_BYTES } from "./file-storage-driver";
import { tenantStorage } from "@/core/decorators/tenant-context";

export class DatabaseFileStorageDriver implements FileStorageDriver {
  readonly name = "database" as const;

  constructor(
    private contents: FileContentRepo,
    private baseUrl: string,
    private partBytes = FILE_STORAGE_PART_BYTES,
  ) {}

  createUpload({ fileId, mimeType, expiresInSeconds }: FileUploadRequest): Promise<FileUploadTarget> {
    return Promise.resolve({
      url: `${this.baseUrl}/api/v1/files/${encodeURIComponent(fileId)}/content`,
      method: "PUT",
      headers: { "Content-Type": mimeType },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    });
  }

  async head(key: string): Promise<StoredFileHead | null> {
    const size = await this.contents.size(key);
    return size ? { size: size.size, contentType: null } : null;
  }

  async read(key: string, range?: StoredFileRange): Promise<StoredFileRead | null> {
    const stored = await this.contents.size(key);
    if (!stored) return null;
    const start = Math.max(0, range?.start ?? 0);
    const end = Math.min(stored.size - 1, range?.end ?? stored.size - 1);
    let part = Math.floor(start / this.partBytes);
    let offset = start - part * this.partBytes;
    let remaining = Math.max(0, end - start + 1);
    const contents = this.contents;
    const tenant = tenantStorage.getStore();
    const readPart = (index: number) =>
      tenant ? tenantStorage.run(tenant, () => contents.readPart(key, index)) : contents.readPart(key, index);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (remaining <= 0) {
          controller.close();
          return;
        }
        const data = await readPart(part);
        if (!data) {
          controller.error(new Error(`Stored file ${key} is missing part ${part}`));
          return;
        }
        const chunk = data.subarray(offset, offset + remaining);
        remaining -= chunk.byteLength;
        part += 1;
        offset = 0;
        controller.enqueue(chunk);
      },
    });
    return { stream, size: stored.size, contentType: null };
  }

  async writeStream(key: string, stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<StoredFileWrite> {
    const hash = createHash("sha256");
    const reader = stream.getReader();
    let buffer = new Uint8Array(this.partBytes);
    let filled = 0;
    let part = 0;
    let size = 0;
    await this.contents.deleteParts([key]);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          await this.contents.deleteParts([key]);
          return { ok: false, reason: "tooLarge" };
        }
        hash.update(value);
        let consumed = 0;
        while (consumed < value.byteLength) {
          const take = Math.min(this.partBytes - filled, value.byteLength - consumed);
          buffer.set(value.subarray(consumed, consumed + take), filled);
          filled += take;
          consumed += take;
          if (filled === this.partBytes) {
            await this.contents.writePart(key, part++, buffer);
            buffer = new Uint8Array(this.partBytes);
            filled = 0;
          }
        }
      }
      if (filled > 0 || part === 0) await this.contents.writePart(key, part, buffer.subarray(0, filled));
      return { ok: true, size, sha256: hash.digest("hex") };
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      await this.contents.deleteParts([key]);
      throw error;
    }
  }

  async delete(keys: string[]): Promise<void> {
    await this.contents.deleteParts(keys);
  }
}
