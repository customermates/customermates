import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { TransformStream } from "node:stream/web";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

describe("Node runtime contract", () => {
  it("uses the fixed Node 24 line for local development, Vercel, CI, and Docker", () => {
    const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    const dockerfile = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8");
    const testWorkflow = readFileSync(join(REPO_ROOT, ".github/workflows/test.yml"), "utf8");
    const pageWorkflow = readFileSync(join(REPO_ROOT, ".github/workflows/page-shipping-e2e.yml"), "utf8");

    expect(packageJson.engines?.node).toBe("^24.15.0");
    expect(readFileSync(join(REPO_ROOT, ".nvmrc"), "utf8").trim()).toBe("24.18.0");
    expect(readFileSync(join(REPO_ROOT, ".node-version"), "utf8").trim()).toBe("24.18.0");
    expect(dockerfile).toMatch(/^FROM node:24-bookworm-slim AS base/m);
    expect(testWorkflow).toMatch(/node-version: 24/);
    expect(pageWorkflow).toMatch(/node-version: 24/);
    expect(process.versions.node.split(".")[0]).toBe("24");
  });

  it("does not leak Node's internal transformAlgorithm TypeError during a cancel/write race", async () => {
    const stream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
    });

    await setTimeout(10);

    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();
    const results = await Promise.allSettled([
      reader.read(),
      reader.cancel(new Error("client disconnected")),
      writer.write("late-write"),
    ]);

    const internalFailures = results.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof TypeError &&
        result.reason.message.includes("transformAlgorithm is not a function"),
    );

    expect(internalFailures).toEqual([]);
  });
});
