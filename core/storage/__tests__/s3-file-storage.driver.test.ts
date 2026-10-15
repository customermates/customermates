import type { S3FileStorageConfig } from "../s3-file-storage.driver";

import { createHash, randomUUID } from "node:crypto";
import { AwsV4Signer } from "aws4fetch";
import { beforeAll, describe, expect, it } from "vitest";

import { S3FileStorageDriver, s3FileStorageConfig } from "../s3-file-storage.driver";
import { bytesOf, contractBytes, defineFileStorageContract, streamOf } from "./file-storage-contract";

const CONFIG: S3FileStorageConfig = {
  endpoint: "https://s3.eu-central-1.amazonaws.com",
  region: "eu-central-1",
  bucket: "crm-files",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  forcePathStyle: false,
};

type Captured = {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
};

function recordingFetch(respond: (request: Captured) => Response) {
  const requests: Captured[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const body = init?.body ? await new Response(init.body).text() : null;
    const request = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body,
    };
    requests.push(request);
    return respond(request);
  };
  return { requests, fetcher };
}

describe("s3 file storage configuration", () => {
  it("needs a bucket and credentials and derives the AWS endpoint from the region", () => {
    expect(() => s3FileStorageConfig({ S3_BUCKET: "files", S3_FORCE_PATH_STYLE: false })).toThrow(
      "S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured",
    );
    expect(
      s3FileStorageConfig({
        S3_BUCKET: " files ",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_REGION: "eu-west-3",
        S3_FORCE_PATH_STYLE: false,
      }),
    ).toEqual({
      endpoint: "https://s3.eu-west-3.amazonaws.com",
      region: "eu-west-3",
      bucket: "files",
      accessKeyId: "key",
      secretAccessKey: "secret",
      forcePathStyle: false,
    });
    expect(
      s3FileStorageConfig({
        S3_ENDPOINT: "http://127.0.0.1:9000/",
        S3_BUCKET: "files",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_FORCE_PATH_STYLE: true,
      }),
    ).toMatchObject({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      forcePathStyle: true,
    });
    expect(() =>
      s3FileStorageConfig({
        S3_ENDPOINT: "ftp://files.example.com",
        S3_BUCKET: "files",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        S3_FORCE_PATH_STYLE: false,
      }),
    ).toThrow("S3_ENDPOINT must be an http or https URL");
  });
});

describe("s3 file storage driver requests", () => {
  it("presigns a 15-minute PUT that binds the content type, the exact length and a first write", async () => {
    const driver = new S3FileStorageDriver(CONFIG);
    const target = await driver.createUpload({
      fileId: randomUUID(),
      key: "company/file/abc",
      size: 1234,
      mimeType: "application/pdf",
      expiresInSeconds: 900,
    });
    const url = new URL(target.url);
    expect(url.origin).toBe("https://crm-files.s3.eu-central-1.amazonaws.com");
    expect(url.pathname).toBe("/company/file/abc");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host;if-none-match");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(target).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "If-None-Match": "*" },
    });
    expect(Date.parse(target.expiresAt) - Date.now()).toBeGreaterThan(890_000);

    const unsigned = new URL(target.url);
    unsigned.searchParams.delete("X-Amz-Signature");
    const expected = await new AwsV4Signer({
      url: unsigned.toString(),
      method: "PUT",
      headers: { "content-length": "1234", "content-type": "application/pdf", "if-none-match": "*" },
      accessKeyId: CONFIG.accessKeyId,
      secretAccessKey: CONFIG.secretAccessKey,
      region: CONFIG.region,
      service: "s3",
      signQuery: true,
      allHeaders: true,
      datetime: url.searchParams.get("X-Amz-Date") ?? undefined,
    }).sign();
    expect(expected.url.searchParams.get("X-Amz-Signature")).toBe(url.searchParams.get("X-Amz-Signature"));
  });

  it("addresses the bucket in the path when path style is forced", async () => {
    const { requests, fetcher } = recordingFetch(() => new Response(null, { status: 404 }));
    const driver = new S3FileStorageDriver(
      { ...CONFIG, endpoint: "http://127.0.0.1:9000", forcePathStyle: true },
      fetcher,
    );
    expect(await driver.head("company/file/abc")).toBeNull();
    expect(requests[0].url).toBe("http://127.0.0.1:9000/crm-files/company/file/abc");
    expect(requests[0].method).toBe("HEAD");
    expect(requests[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
  });

  it("reads a range, reports the whole size and answers an unsatisfiable range with an empty stream", async () => {
    const { requests, fetcher } = recordingFetch((request) =>
      request.headers.get("range") === "bytes=2-4"
        ? new Response("cde", {
            status: 206,
            headers: {
              "content-range": "bytes 2-4/10",
              "content-type": "text/plain",
            },
          })
        : new Response(null, {
            status: 416,
            headers: { "content-range": "bytes */10" },
          }),
    );
    const driver = new S3FileStorageDriver(CONFIG, fetcher);
    const range = await driver.read("company/file/abc", { start: 2, end: 4 });
    expect(range).toMatchObject({ size: 10, contentType: "text/plain" });
    expect(new TextDecoder().decode(await bytesOf(range))).toBe("cde");
    const beyond = await driver.read("company/file/abc", { start: 20 });
    expect(beyond?.size).toBe(10);
    expect(await bytesOf(beyond)).toEqual(new Uint8Array(0));
    expect(requests.map((request) => request.headers.get("range"))).toEqual(["bytes=2-4", "bytes=20-"]);
  });

  it("uploads server-side with a signed payload hash", async () => {
    const { requests, fetcher } = recordingFetch(() => new Response(null, { status: 200 }));
    const driver = new S3FileStorageDriver(CONFIG, fetcher);
    const content = new TextEncoder().encode("hello world");
    const sha256 = createHash("sha256").update(content).digest("hex");
    expect(await driver.writeStream("company/file/abc", streamOf(content), 100)).toEqual({
      ok: true,
      size: 11,
      sha256,
    });
    expect(requests[0]).toMatchObject({ method: "PUT", body: "hello world" });
    expect(requests[0].headers.get("x-amz-content-sha256")).toBe(sha256);
    expect(await driver.writeStream("company/file/abc", streamOf(content), 10)).toEqual({
      ok: false,
      reason: "tooLarge",
    });
    expect(requests).toHaveLength(1);
  });

  it("deletes keys with one DeleteObjects request per thousand keys and fails on reported errors", async () => {
    const { requests, fetcher } = recordingFetch((request) =>
      request.body?.includes("broken")
        ? new Response("<DeleteResult><Error><Key>broken</Key><Code>AccessDenied</Code></Error></DeleteResult>")
        : new Response("<DeleteResult></DeleteResult>"),
    );
    const driver = new S3FileStorageDriver(CONFIG, fetcher);
    const keys = Array.from({ length: 1001 }, (_, index) => `company/file-${index}`);
    await driver.delete([...keys, keys[0], "company/<&>"]);
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe("https://crm-files.s3.eu-central-1.amazonaws.com/?delete=");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("content-md5")).toBe(
      createHash("md5")
        .update(requests[0].body ?? "")
        .digest("base64"),
    );
    expect(requests[0].body).toContain("<Quiet>true</Quiet><Object><Key>company/file-0</Key></Object>");
    expect(requests[1].body).toContain("<Key>company/&lt;&amp;&gt;</Key>");
    await driver.delete([]);
    expect(requests).toHaveLength(2);
    await expect(driver.delete(["broken"])).rejects.toThrow("S3 did not delete every file");
  });
});

const contractUrl = process.env.S3_CONTRACT_URL ? new URL(process.env.S3_CONTRACT_URL) : null;
const describeMinio = contractUrl ? describe : describe.skip;

describeMinio("s3 file storage driver against an S3-compatible server", () => {
  const config: S3FileStorageConfig = {
    endpoint: contractUrl?.origin ?? "",
    region: "us-east-1",
    bucket: contractUrl?.pathname.replace(/^\/+|\/+$/gu, "") || "lane-files",
    accessKeyId: decodeURIComponent(contractUrl?.username ?? ""),
    secretAccessKey: decodeURIComponent(contractUrl?.password ?? ""),
    forcePathStyle: true,
  };
  const driver = new S3FileStorageDriver(config);

  beforeAll(async () => {
    const signed = await new AwsV4Signer({
      url: `${config.endpoint}/${config.bucket}`,
      method: "PUT",
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      service: "s3",
    }).sign();
    const response = await fetch(signed.url, {
      method: "PUT",
      headers: signed.headers,
    });
    if (!response.ok && response.status !== 409) throw new Error(`Bucket setup failed with ${response.status}`);
  });

  defineFileStorageContract({
    driver: () => driver,
    run: (fn) => fn(),
    keyPrefix: () => Promise.resolve(`contract-${randomUUID()}`),
  });

  it("accepts a direct upload through the presigned URL and refuses other sizes and types", async () => {
    const key = `contract-${randomUUID()}/${randomUUID()}`;
    const content = contractBytes(2048);
    const target = await driver.createUpload({
      fileId: randomUUID(),
      key,
      size: content.byteLength,
      mimeType: "application/pdf",
      expiresInSeconds: 900,
    });
    const tooLong = await fetch(target.url, {
      method: target.method,
      headers: target.headers,
      body: new Blob([new Uint8Array(contractBytes(2049))]),
    });
    expect(tooLong.ok).toBe(false);
    const wrongType = await fetch(target.url, {
      method: target.method,
      headers: { "Content-Type": "text/html" },
      body: new Blob([new Uint8Array(content)]),
    });
    expect(wrongType.ok).toBe(false);
    expect(await driver.head(key)).toBeNull();
    const uploaded = await fetch(target.url, {
      method: target.method,
      headers: target.headers,
      body: new Blob([new Uint8Array(content)]),
    });
    expect(uploaded.status).toBe(200);
    expect(await driver.head(key)).toEqual({
      size: 2048,
      contentType: "application/pdf",
    });
    expect(await bytesOf(await driver.read(key))).toEqual(content);
    await driver.delete([key]);
  });

  it("refuses a second upload through the same presigned URL, so an attached file cannot be replaced", async () => {
    const key = `contract-${randomUUID()}/${randomUUID()}`;
    const content = contractBytes(64);
    const target = await driver.createUpload({
      fileId: randomUUID(),
      key,
      size: content.byteLength,
      mimeType: "application/pdf",
      expiresInSeconds: 900,
    });
    const put = (body: Uint8Array) =>
      fetch(target.url, { method: target.method, headers: target.headers, body: new Blob([new Uint8Array(body)]) });
    expect((await put(content)).status).toBe(200);
    const replaced = await put(contractBytes(64).map((byte) => byte ^ 0xff));
    expect(replaced.status).toBe(412);
    expect(await bytesOf(await driver.read(key))).toEqual(content);
    await driver.delete([key]);
  });

  it("deletes every object under a workspace prefix and leaves other prefixes alone", async () => {
    const company = `contract-${randomUUID()}`;
    const neighbour = `contract-${randomUUID()}`;
    const keys = Array.from({ length: 4 }, () => `${company}/${randomUUID()}/key`);
    const kept = `${neighbour}/${randomUUID()}/key`;
    for (const key of [...keys, kept]) await driver.writeStream(key, streamOf(contractBytes(16)), 100);
    expect(await driver.deletePrefix(`${company}/`)).toBe(4);
    for (const key of keys) expect(await driver.head(key)).toBeNull();
    expect((await driver.head(kept))?.size).toBe(16);
    expect(await driver.deletePrefix(`${company}/`)).toBe(0);
    await driver.delete([kept]);
  });

  it("refuses a presigned upload after it expired", async () => {
    const key = `contract-${randomUUID()}/${randomUUID()}`;
    const target = await driver.createUpload({
      fileId: randomUUID(),
      key,
      size: 4,
      mimeType: "text/plain",
      expiresInSeconds: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const response = await fetch(target.url, {
      method: "PUT",
      headers: target.headers,
      body: "late",
    });
    expect(response.status).toBe(403);
    expect(await driver.head(key)).toBeNull();
  });
});
