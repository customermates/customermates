import type { VercelBlobClient } from "../vercel-blob-file-storage.driver";

import { createHash } from "node:crypto";
import { BlobError, BlobNotFoundError, presignUrl } from "@vercel/blob";
import { describe, expect, it, vi, type Mock } from "vitest";

import { VercelBlobFileStorageDriver } from "../vercel-blob-file-storage.driver";
import { bytesOf, streamOf } from "./file-storage-contract";

function delegationToken(payload: Record<string, unknown>) {
  return `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

function client(
  overrides: Partial<{
    [K in keyof VercelBlobClient]: Mock<VercelBlobClient[K]>;
  }> = {},
) {
  return {
    issueSignedToken: vi.fn<VercelBlobClient["issueSignedToken"]>(),
    presignUrl: vi.fn<VercelBlobClient["presignUrl"]>(presignUrl),
    head: vi.fn<VercelBlobClient["head"]>(),
    get: vi.fn<VercelBlobClient["get"]>(),
    del: vi.fn<VercelBlobClient["del"]>(() => Promise.resolve()),
    put: vi.fn<VercelBlobClient["put"]>(),
    list: vi.fn<VercelBlobClient["list"]>(),
    ...overrides,
  };
}

function getResult(body: string, headers: Record<string, string>, size: number) {
  return {
    statusCode: 200 as const,
    stream: new Response(body).body as ReadableStream<Uint8Array>,
    headers: new Headers(headers) as never,
    blob: {
      url: "https://store.private.blob.vercel-storage.com/company/file",
      downloadUrl: "https://store.private.blob.vercel-storage.com/company/file?download=1",
      pathname: "company/file",
      contentDisposition: "",
      cacheControl: "",
      uploadedAt: new Date(),
      etag: "etag",
      contentType: "text/plain",
      size,
    },
  };
}

describe("vercel blob file storage driver", () => {
  it("presigns a private PUT scoped to the key, the declared size and the content type", async () => {
    const blob = client();
    blob.issueSignedToken.mockImplementation((options) =>
      Promise.resolve({
        delegationToken: delegationToken({
          storeId: "store_abc123",
          pathname: options.pathname,
          operations: options.operations,
          validUntil: options.validUntil,
          maximumSizeInBytes: options.maximumSizeInBytes,
          allowedContentTypes: options.allowedContentTypes,
        }),
        clientSigningToken: "client-signing-token",
        validUntil: options.validUntil ?? 0,
      }),
    );
    const driver = new VercelBlobFileStorageDriver(blob);
    const target = await driver.createUpload({
      fileId: "file",
      key: "company/file/abc",
      size: 4096,
      mimeType: "application/pdf",
      expiresInSeconds: 900,
    });

    const [tokenOptions] = blob.issueSignedToken.mock.calls[0];
    expect(tokenOptions).toMatchObject({
      pathname: "company/file/abc",
      operations: ["put"],
      maximumSizeInBytes: 4096,
      allowedContentTypes: ["application/pdf"],
    });
    expect((tokenOptions.validUntil ?? 0) - Date.now()).toBeGreaterThan(890_000);
    expect(blob.presignUrl.mock.calls[0][1]).toMatchObject({
      operation: "put",
      pathname: "company/file/abc",
      access: "private",
      allowOverwrite: true,
    });
    const url = new URL(target.url);
    expect(url.searchParams.get("pathname")).toBe("company/file/abc");
    expect(url.searchParams.get("vercel-blob-delegation")).toBeTruthy();
    expect(url.searchParams.get("vercel-blob-signature")).toBeTruthy();
    expect(url.searchParams.get("vercel-blob-allow-overwrite")).toBe("true");
    expect(target).toMatchObject({
      method: "PUT",
      headers: {
        "x-vercel-blob-access": "private",
        "x-vercel-blob-store-id": "abc123",
        "x-content-type": "application/pdf",
      },
    });
    expect(target.expiresAt).toBe(new Date(tokenOptions.validUntil ?? 0).toISOString());
  });

  it("reports a missing blob as null and passes other failures on", async () => {
    const blob = client({
      head: vi
        .fn<VercelBlobClient["head"]>()
        .mockRejectedValueOnce(new BlobNotFoundError())
        .mockResolvedValueOnce({
          size: 12,
          contentType: "application/pdf",
        } as never)
        .mockRejectedValueOnce(new BlobError("store suspended")),
    });
    const driver = new VercelBlobFileStorageDriver(blob);
    expect(await driver.head("company/missing")).toBeNull();
    expect(await driver.head("company/file")).toEqual({
      size: 12,
      contentType: "application/pdf",
    });
    await expect(driver.head("company/file")).rejects.toThrow("store suspended");
  });

  it("reads privately without the CDN cache, by range, and answers an unsatisfiable range with an empty stream", async () => {
    const blob = client({
      get: vi
        .fn<VercelBlobClient["get"]>()
        .mockResolvedValueOnce(getResult("hello world", { "content-length": "11" }, 11))
        .mockResolvedValueOnce(getResult("llo", { "content-range": "bytes 2-4/11" }, 3))
        .mockRejectedValueOnce(new BlobError("Failed to fetch blob: 416 Range Not Satisfiable"))
        .mockResolvedValueOnce(null),
      head: vi.fn<VercelBlobClient["head"]>().mockResolvedValue({ size: 11, contentType: "text/plain" } as never),
    });
    const driver = new VercelBlobFileStorageDriver(blob);
    const whole = await driver.read("company/file");
    expect(whole).toMatchObject({ size: 11, contentType: "text/plain" });
    expect(new TextDecoder().decode(await bytesOf(whole))).toBe("hello world");
    const range = await driver.read("company/file", { start: 2, end: 4 });
    expect(range?.size).toBe(11);
    expect(new TextDecoder().decode(await bytesOf(range))).toBe("llo");
    const beyond = await driver.read("company/file", { start: 40 });
    expect(beyond?.size).toBe(11);
    expect(await bytesOf(beyond)).toEqual(new Uint8Array(0));
    expect(await driver.read("company/missing")).toBeNull();
    expect(blob.get.mock.calls.map(([, options]) => options)).toEqual([
      { access: "private", useCache: false },
      { access: "private", useCache: false, headers: { range: "bytes=2-4" } },
      { access: "private", useCache: false, headers: { range: "bytes=40-" } },
      { access: "private", useCache: false },
    ]);
  });

  it("uploads server-side within the byte limit and deletes in batches", async () => {
    const blob = client({
      put: vi.fn<VercelBlobClient["put"]>().mockResolvedValue({} as never),
    });
    const driver = new VercelBlobFileStorageDriver(blob);
    const content = new TextEncoder().encode("contract");
    expect(await driver.writeStream("company/file", streamOf(content), 100)).toEqual({
      ok: true,
      size: 8,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
    expect(blob.put).toHaveBeenCalledWith("company/file", Buffer.from(content), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/octet-stream",
    });
    expect(await driver.writeStream("company/file", streamOf(content), 4)).toEqual({ ok: false, reason: "tooLarge" });
    expect(blob.put).toHaveBeenCalledTimes(1);

    const keys = Array.from({ length: 150 }, (_, index) => `company/file-${index}`);
    await driver.delete([...keys, keys[0]]);
    expect(blob.del.mock.calls.map(([batch]) => (batch as string[]).length)).toEqual([100, 50]);
    await driver.delete([]);
    expect(blob.del).toHaveBeenCalledTimes(2);
  });

  it("deletes every blob under a workspace prefix page by page", async () => {
    const blob = client({
      list: vi
        .fn<VercelBlobClient["list"]>()
        .mockResolvedValueOnce({
          blobs: [{ pathname: "company/a" }, { pathname: "company/b" }],
          cursor: "next",
          hasMore: true,
        })
        .mockResolvedValueOnce({
          blobs: [{ pathname: "company/c" }],
          hasMore: false,
        }),
    });
    const driver = new VercelBlobFileStorageDriver(blob);
    expect(await driver.deletePrefix("company/")).toBe(3);
    expect(blob.list.mock.calls.map(([options]) => options)).toEqual([
      { prefix: "company/", cursor: undefined, limit: 100 },
      { prefix: "company/", cursor: "next", limit: 100 },
    ]);
    expect(blob.del.mock.calls.map(([keys]) => keys)).toEqual([["company/a", "company/b"], ["company/c"]]);
  });
});
