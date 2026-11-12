import { describe, expect, it } from "vitest";

import { readRuntimeJson, readRuntimeJsonSync } from "../runtime-json";

describe("runtime JSON files", () => {
  it("reads a JSON file relative to the working directory, asynchronously and synchronously", async () => {
    const asynchronous = await readRuntimeJson<{ name: string }>("package.json");
    const synchronous = readRuntimeJsonSync<{ name: string }>("package.json");

    expect(asynchronous.name).toBe("customermates");
    expect(synchronous.name).toBe("customermates");
  });

  it("parses each file once per process", () => {
    expect(readRuntimeJson("package.json")).toBe(readRuntimeJson("package.json"));
    expect(readRuntimeJsonSync("package.json")).toBe(readRuntimeJsonSync("package.json"));
  });

  it("rejects a missing file and tries the read again next time", async () => {
    await expect(readRuntimeJson("generated/does-not-exist.json")).rejects.toThrow();
    await expect(readRuntimeJson("generated/does-not-exist.json")).rejects.toThrow();
    expect(() => readRuntimeJsonSync("generated/does-not-exist.json")).toThrow();
  });
});
