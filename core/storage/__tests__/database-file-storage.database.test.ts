import type { FileStorageDriver, StoredFileRead } from "../file-storage-driver";

import { randomBytes, createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PrismaFileContentRepo } = await import("../prisma-file-content.repository");
const { DatabaseFileStorageDriver } = await import("../database-file-storage.driver");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

async function tenant() {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Admin",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return createMockUser({ ...user, role: { ...role, permissions: [] } });
  });
}

function bytes(size: number): Uint8Array {
  return new Uint8Array(randomBytes(size));
}

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function bytesOf(read: StoredFileRead | null, pauseMs = 0): Promise<Uint8Array> {
  if (!read) throw new Error("Expected a stored file");
  const reader = read.stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

describeDatabase("database file storage driver", () => {
  it("stores a file in parts and reads it whole, by range, and after deletion as missing", async () => {
    const user = await tenant();
    const driver: FileStorageDriver = new DatabaseFileStorageDriver(
      new PrismaFileContentRepo(),
      "http://127.0.0.1:4000",
      7,
    );
    const key = `${user.companyId}/${randomUUID()}`;
    const content = bytes(30);

    await runWithTenant(user, async () => {
      const written = await driver.writeStream(key, streamOf(content.subarray(0, 4), content.subarray(4)), 1000);
      expect(written).toEqual({ ok: true, size: 30, sha256: createHash("sha256").update(content).digest("hex") });
      expect(await driver.head(key)).toEqual({ size: 30, contentType: null });
      const stored = await runWithoutTenant(() =>
        prisma.recordFileContent.findMany({ where: { fileKey: key }, orderBy: { part: "asc" } }),
      );
      expect(stored.map((row) => [row.part, row.data.byteLength, row.companyId])).toEqual([
        [0, 7, user.companyId],
        [1, 7, user.companyId],
        [2, 7, user.companyId],
        [3, 7, user.companyId],
        [4, 2, user.companyId],
      ]);

      const whole = await driver.read(key);
      expect(whole?.size).toBe(30);
      expect(await bytesOf(whole)).toEqual(content);

      const range = await driver.read(key, { start: 5, end: 22 });
      expect(await bytesOf(range)).toEqual(content.subarray(5, 23));

      const tail = await driver.read(key, { start: 28 });
      expect(await bytesOf(tail)).toEqual(content.subarray(28));

      const beyond = await driver.read(key, { start: 40 });
      expect(await bytesOf(beyond)).toEqual(new Uint8Array(0));

      await driver.delete([key]);
      expect(await driver.head(key)).toBeNull();
      expect(await driver.read(key)).toBeNull();
    });
    const parts = await runWithoutTenant(() => prisma.recordFileContent.count({ where: { fileKey: key } }));
    expect(parts).toBe(0);
  });

  it("keeps streaming a read after the request's tenant context has ended", async () => {
    const user = await tenant();
    const stranger = await tenant();
    const driver = new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "http://127.0.0.1:4000", 5);
    const key = `${user.companyId}/${randomUUID()}`;
    const content = bytes(23);

    const read = await runWithTenant(user, async () => {
      await driver.writeStream(key, streamOf(content), 100);
      return driver.read(key);
    });
    expect(await runWithTenant(stranger, () => bytesOf(read, 25))).toEqual(content);
  });

  it("refuses an upload above the size limit and keeps no partial parts", async () => {
    const user = await tenant();
    const driver = new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "http://127.0.0.1:4000", 4);
    const key = `${user.companyId}/${randomUUID()}`;
    await runWithTenant(user, async () => {
      expect(await driver.writeStream(key, streamOf(bytes(6), bytes(6)), 10)).toEqual({
        ok: false,
        reason: "tooLarge",
      });
      expect(await driver.head(key)).toBeNull();
    });
  });

  it("replaces an earlier upload under the same key", async () => {
    const user = await tenant();
    const driver = new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "http://127.0.0.1:4000", 4);
    const key = `${user.companyId}/${randomUUID()}`;
    const replacement = bytes(3);
    await runWithTenant(user, async () => {
      await driver.writeStream(key, streamOf(bytes(10)), 100);
      expect(await driver.writeStream(key, streamOf(replacement), 100)).toMatchObject({ ok: true, size: 3 });
      expect(await driver.head(key)).toEqual({ size: 3, contentType: null });
      expect(await bytesOf(await driver.read(key))).toEqual(replacement);
    });
  });

  it("stores an empty file and keeps other workspaces from reading it", async () => {
    const user = await tenant();
    const stranger = await tenant();
    const driver = new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "http://127.0.0.1:4000");
    const key = `${user.companyId}/${randomUUID()}`;
    await runWithTenant(user, async () => {
      expect(await driver.writeStream(key, streamOf(), 10)).toMatchObject({ ok: true, size: 0 });
      expect(await driver.head(key)).toEqual({ size: 0, contentType: null });
      expect(await bytesOf(await driver.read(key))).toEqual(new Uint8Array(0));
    });
    await runWithTenant(stranger, async () => {
      expect(await driver.head(key)).toBeNull();
      expect(await driver.read(key)).toBeNull();
      await driver.delete([key]);
    });
    await runWithTenant(user, async () => expect(await driver.head(key)).toEqual({ size: 0, contentType: null }));
  });

  it("points uploads at the app content route", async () => {
    const driver = new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "https://crm.example.com");
    const target = await driver.createUpload({
      fileId: "11111111-1111-4111-8111-111111111111",
      key: "company/file",
      size: 10,
      mimeType: "application/pdf",
      expiresInSeconds: 900,
    });
    expect(target).toMatchObject({
      url: "https://crm.example.com/api/v1/files/11111111-1111-4111-8111-111111111111/content",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
    });
    expect(Date.parse(target.expiresAt)).toBeGreaterThan(Date.now() + 800_000);
  });
});
