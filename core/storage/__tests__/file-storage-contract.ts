import type { FileStorageDriver, StoredFileRead } from "../file-storage-driver";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";

export type FileStorageContractSetup = {
  driver: () => FileStorageDriver;
  run: <T>(fn: () => Promise<T>) => Promise<T>;
  keyPrefix: () => Promise<string>;
};

export function contractBytes(size: number): Uint8Array {
  return new Uint8Array(randomBytes(size));
}

export function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

export async function bytesOf(read: StoredFileRead | null): Promise<Uint8Array> {
  if (!read) throw new Error("Expected a stored file");
  return new Uint8Array(await new Response(read.stream).arrayBuffer());
}

export function defineFileStorageContract(setup: FileStorageContractSetup) {
  const sha256 = (content: Uint8Array) => createHash("sha256").update(content).digest("hex");

  it("writes a file, reports its size, reads it whole and by range, and deletes it", async () => {
    const key = `${await setup.keyPrefix()}/${randomUUID()}`;
    const content = contractBytes(3000);
    await setup.run(async () => {
      const driver = setup.driver();
      expect(await driver.writeStream(key, streamOf(content.subarray(0, 1000), content.subarray(1000)), 5000)).toEqual({
        ok: true,
        size: 3000,
        sha256: sha256(content),
      });
      expect((await driver.head(key))?.size).toBe(3000);
      const whole = await driver.read(key);
      expect(whole?.size).toBe(3000);
      expect(await bytesOf(whole)).toEqual(content);
      const range = await driver.read(key, { start: 100, end: 1999 });
      expect(range?.size).toBe(3000);
      expect(await bytesOf(range)).toEqual(content.subarray(100, 2000));
      expect(await bytesOf(await driver.read(key, { start: 2990 }))).toEqual(content.subarray(2990));
      const beyond = await driver.read(key, { start: 4000 });
      expect(beyond?.size).toBe(3000);
      expect(await bytesOf(beyond)).toEqual(new Uint8Array(0));
      await driver.delete([key]);
      expect(await driver.head(key)).toBeNull();
      expect(await driver.read(key)).toBeNull();
    });
  });

  it("refuses a write above the byte limit and keeps nothing", async () => {
    const key = `${await setup.keyPrefix()}/${randomUUID()}`;
    await setup.run(async () => {
      const driver = setup.driver();
      expect(await driver.writeStream(key, streamOf(contractBytes(600), contractBytes(600)), 1000)).toEqual({
        ok: false,
        reason: "tooLarge",
      });
      expect(await driver.head(key)).toBeNull();
    });
  });

  it("replaces an earlier file under the same key and stores an empty file", async () => {
    const key = `${await setup.keyPrefix()}/${randomUUID()}`;
    const empty = `${await setup.keyPrefix()}/${randomUUID()}`;
    const replacement = contractBytes(17);
    await setup.run(async () => {
      const driver = setup.driver();
      await driver.writeStream(key, streamOf(contractBytes(40)), 100);
      expect(await driver.writeStream(key, streamOf(replacement), 100)).toMatchObject({ ok: true, size: 17 });
      expect((await driver.head(key))?.size).toBe(17);
      expect(await bytesOf(await driver.read(key))).toEqual(replacement);
      expect(await driver.writeStream(empty, streamOf(), 100)).toMatchObject({
        ok: true,
        size: 0,
      });
      expect((await driver.head(empty))?.size).toBe(0);
      expect(await bytesOf(await driver.read(empty))).toEqual(new Uint8Array(0));
      await driver.delete([key, empty, key]);
      expect(await driver.head(key)).toBeNull();
      expect(await driver.head(empty)).toBeNull();
    });
  });

  it("deletes many files at once and ignores keys that are already gone", async () => {
    const prefix = await setup.keyPrefix();
    const keys = Array.from({ length: 5 }, () => `${prefix}/${randomUUID()}`);
    await setup.run(async () => {
      const driver = setup.driver();
      for (const key of keys) await driver.writeStream(key, streamOf(contractBytes(8)), 100);
      await driver.delete([...keys, `${prefix}/${randomUUID()}`]);
      for (const key of keys) expect(await driver.head(key)).toBeNull();
      await driver.delete(keys);
      await driver.delete([]);
    });
  });
}
