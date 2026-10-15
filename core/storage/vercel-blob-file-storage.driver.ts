import type { del, get, head, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type {
  FileStorageDriver,
  FileUploadRequest,
  FileUploadTarget,
  StoredFileHead,
  StoredFileRange,
  StoredFileRead,
  StoredFileWrite,
} from "./file-storage-driver";

import { BlobError, BlobNotFoundError, parseStoreIdFromDelegationToken } from "@vercel/blob";

import { emptyFileStream, readCappedStream, totalSizeOfContentRange } from "./read-capped-stream";

export type VercelBlobClient = {
  issueSignedToken: typeof issueSignedToken;
  presignUrl: typeof presignUrl;
  head: typeof head;
  get: typeof get;
  del: typeof del;
  put: typeof put;
  list: (options: {
    prefix: string;
    cursor?: string;
    limit?: number;
  }) => Promise<{ blobs: Array<{ pathname: string }>; cursor?: string; hasMore: boolean }>;
};

const VERCEL_BLOB_API_VERSION = "13";
const VERCEL_BLOB_DELETE_BATCH = 100;

function unsatisfiableRange(error: unknown): boolean {
  return error instanceof BlobError && /\b416\b/u.test(error.message);
}

export class VercelBlobFileStorageDriver implements FileStorageDriver {
  readonly name = "vercel-blob" as const;

  constructor(private blob: VercelBlobClient) {}

  async createUpload({ key, size, mimeType, expiresInSeconds }: FileUploadRequest): Promise<FileUploadTarget> {
    const validUntil = Date.now() + expiresInSeconds * 1000;
    const token = await this.blob.issueSignedToken({
      pathname: key,
      operations: ["put"],
      validUntil,
      maximumSizeInBytes: Math.max(1, size),
      allowedContentTypes: [mimeType],
    });
    const { presignedUrl } = await this.blob.presignUrl(token, {
      operation: "put",
      pathname: key,
      access: "private",
      validUntil,
      maximumSizeInBytes: Math.max(1, size),
      allowedContentTypes: [mimeType],
      allowOverwrite: true,
    });
    return {
      url: presignedUrl,
      method: "PUT",
      headers: {
        "x-api-version": VERCEL_BLOB_API_VERSION,
        "x-vercel-blob-access": "private",
        "x-vercel-blob-store-id": parseStoreIdFromDelegationToken(token.delegationToken),
        "x-content-type": mimeType,
      },
      expiresAt: new Date(validUntil).toISOString(),
    };
  }

  async head(key: string): Promise<StoredFileHead | null> {
    try {
      const blob = await this.blob.head(key);
      return { size: blob.size, contentType: blob.contentType || null };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  async read(key: string, range?: StoredFileRange): Promise<StoredFileRead | null> {
    const headers = range
      ? { range: `bytes=${Math.max(0, range.start)}-${range.end === undefined ? "" : range.end}` }
      : undefined;
    try {
      const result = await this.blob.get(key, { access: "private", useCache: false, ...(headers ? { headers } : {}) });
      if (!result || result.statusCode !== 200) return null;
      const size = range ? totalSizeOfContentRange(result.headers.get("content-range")) : result.blob.size;
      return { stream: result.stream, size: size ?? result.blob.size, contentType: result.blob.contentType || null };
    } catch (error) {
      if (!range || !unsatisfiableRange(error)) throw error;
      const stored = await this.head(key);
      return stored ? { stream: emptyFileStream(), size: stored.size, contentType: stored.contentType } : null;
    }
  }

  async writeStream(key: string, stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<StoredFileWrite> {
    const read = await readCappedStream(stream, maxBytes);
    if (!read.ok) return read;
    await this.blob.put(key, Buffer.from(read.bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/octet-stream",
    });
    return { ok: true, size: read.bytes.byteLength, sha256: read.sha256 };
  }

  async delete(keys: string[]): Promise<void> {
    const unique = [...new Set(keys)];
    for (let index = 0; index < unique.length; index += VERCEL_BLOB_DELETE_BATCH)
      await this.blob.del(unique.slice(index, index + VERCEL_BLOB_DELETE_BATCH));
  }

  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let cursor: string | undefined;
    do {
      const page = await this.blob.list({ prefix, cursor, limit: VERCEL_BLOB_DELETE_BATCH });
      await this.delete(page.blobs.map((blob) => blob.pathname));
      deleted += page.blobs.length;
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return deleted;
  }
}
