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

import { AwsV4Signer } from "aws4fetch";

import { emptyFileStream, readCappedStream, totalSizeOfContentRange } from "./read-capped-stream";

export type S3FileStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

type S3Environment = {
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE: boolean;
};

const S3_DELETE_BATCH = 1000;
const DEFAULT_S3_REGION = "us-east-1";

export function s3FileStorageConfig(source: S3Environment): S3FileStorageConfig {
  const bucket = source.S3_BUCKET?.trim();
  const accessKeyId = source.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = source.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured when FILE_STORAGE_DRIVER is s3",
    );
  }
  const region = source.S3_REGION?.trim() || DEFAULT_S3_REGION;
  const endpoint = (source.S3_ENDPOINT?.trim() || `https://s3.${region}.amazonaws.com`).replace(/\/+$/u, "");
  try {
    const { protocol } = new URL(endpoint);
    if (protocol !== "http:" && protocol !== "https:") throw new Error(protocol);
  } catch {
    throw new Error("S3_ENDPOINT must be an http or https URL");
  }
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle: source.S3_FORCE_PATH_STYLE };
}

function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export class S3FileStorageDriver implements FileStorageDriver {
  readonly name = "s3" as const;

  constructor(
    private config: S3FileStorageConfig,
    private fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private bucketUrl(): URL {
    const endpoint = new URL(this.config.endpoint);
    const base = endpoint.pathname.replace(/\/+$/u, "");
    if (this.config.forcePathStyle) {
      endpoint.pathname = `${base}/${encodeURIComponent(this.config.bucket)}`;
      return endpoint;
    }
    endpoint.hostname = `${this.config.bucket}.${endpoint.hostname}`;
    endpoint.pathname = base || "/";
    return endpoint;
  }

  private objectUrl(key: string): URL {
    const url = this.bucketUrl();
    const path = key.split("/").map(encodeURIComponent).join("/");
    url.pathname = `${url.pathname.replace(/\/+$/u, "")}/${path}`;
    return url;
  }

  private signer(
    url: URL,
    method: string,
    headers: Record<string, string> = {},
    options: { signQuery?: boolean; allHeaders?: boolean } = {},
  ) {
    return new AwsV4Signer({
      url: url.toString(),
      method,
      headers,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: this.config.region,
      service: "s3",
      ...options,
    });
  }

  private async send(
    url: URL,
    method: string,
    headers: Record<string, string> = {},
    body?: Uint8Array | string,
  ): Promise<Response> {
    const signed = await this.signer(url, method, headers).sign();
    return this.fetcher(signed.url.toString(), {
      method,
      headers: signed.headers,
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : new Blob([new Uint8Array(body)]) }),
    });
  }

  async createUpload({ key, size, mimeType, expiresInSeconds }: FileUploadRequest): Promise<FileUploadTarget> {
    const url = this.objectUrl(key);
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
    const signed = await this.signer(
      url,
      "PUT",
      { "content-length": String(size), "content-type": mimeType, "if-none-match": "*" },
      { signQuery: true, allHeaders: true },
    ).sign();
    return {
      url: signed.url.toString(),
      method: "PUT",
      headers: { "Content-Type": mimeType, "If-None-Match": "*" },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async head(key: string): Promise<StoredFileHead | null> {
    const response = await this.send(this.objectUrl(key), "HEAD");
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`S3 answered ${response.status} to a HEAD request`);
    return {
      size: Number(response.headers.get("content-length") ?? 0),
      contentType: response.headers.get("content-type"),
    };
  }

  async read(key: string, range?: StoredFileRange): Promise<StoredFileRead | null> {
    const headers: Record<string, string> = range
      ? { range: `bytes=${Math.max(0, range.start)}-${range.end === undefined ? "" : range.end}` }
      : {};
    const response = await this.send(this.objectUrl(key), "GET", headers);
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (response.status === 416) {
      await response.body?.cancel();
      const size = totalSizeOfContentRange(response.headers.get("content-range"));
      const stored = size === null ? await this.head(key) : { size, contentType: null };
      return stored ? { stream: emptyFileStream(), size: stored.size, contentType: stored.contentType } : null;
    }
    if (!response.ok || !response.body) throw new Error(`S3 answered ${response.status} to a GET request`);
    const size =
      response.status === 206
        ? totalSizeOfContentRange(response.headers.get("content-range"))
        : Number(response.headers.get("content-length") ?? 0);
    return { stream: response.body, size: size ?? 0, contentType: response.headers.get("content-type") };
  }

  async writeStream(key: string, stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<StoredFileWrite> {
    const read = await readCappedStream(stream, maxBytes);
    if (!read.ok) return read;
    const response = await this.send(this.objectUrl(key), "PUT", { "x-amz-content-sha256": read.sha256 }, read.bytes);
    if (!response.ok) throw new Error(`S3 answered ${response.status} to a PUT request`);
    return { ok: true, size: read.bytes.byteLength, sha256: read.sha256 };
  }

  async delete(keys: string[]): Promise<void> {
    const unique = [...new Set(keys)];
    for (let index = 0; index < unique.length; index += S3_DELETE_BATCH) {
      const batch = unique.slice(index, index + S3_DELETE_BATCH);
      const body = `<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>${batch
        .map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`)
        .join("")}</Delete>`;
      const url = this.bucketUrl();
      url.search = "delete=";
      const response = await this.send(
        url,
        "POST",
        { "content-md5": createHash("md5").update(body).digest("base64"), "content-type": "application/xml" },
        body,
      );
      const result = await response.text();
      if (!response.ok || result.includes("<Error>"))
        throw new Error(`S3 did not delete every file (status ${response.status})`);
    }
  }

  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let token: string | null = null;
    do {
      const url = this.bucketUrl();
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", prefix);
      url.searchParams.set("max-keys", String(S3_DELETE_BATCH));
      if (token) url.searchParams.set("continuation-token", token);
      const response = await this.send(url, "GET");
      const listing = await response.text();
      if (!response.ok) throw new Error(`S3 answered ${response.status} to a list request`);
      const keys = [...listing.matchAll(/<Key>([^<]*)<\/Key>/gu)].map((match) => unescapeXml(match[1]));
      await this.delete(keys);
      deleted += keys.length;
      const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/u.exec(listing)?.[1];
      token = /<IsTruncated>true<\/IsTruncated>/u.test(listing) && next ? unescapeXml(next) : null;
    } while (token);
    return deleted;
  }
}
