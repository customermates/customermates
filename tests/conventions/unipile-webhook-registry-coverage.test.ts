import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "./walk";

const WIRE_ONLY_EVENTS = new Set<string>();

function specTriggerEvents(): Set<string> {
  const source = readFileSync(join(REPO_ROOT, "node_modules/@unipile/sdk/dist/types.gen.d.ts"), "utf8");
  const union = source.match(/trigger_events: Array<([^>]+)>/)?.[1];
  if (!union) throw new Error("trigger_events union not found in @unipile/sdk types.gen.d.ts");

  return new Set([...union.matchAll(/'([a-z._]+)'/g)].map((match) => match[1]));
}

function registryEvents(): Set<string> {
  const source = readFileSync(join(REPO_ROOT, "core/di.ts"), "utf8");
  const block = source.match(/const handlers: UnipileWebhookHandlerMap = \{([\s\S]*?)\n {2}\};/)?.[1];
  if (!block) throw new Error("handlers registry not found in core/di.ts");

  return new Set([...block.matchAll(/"([a-z._]+)":/g)].map((match) => match[1]));
}

describe("Unipile webhook registry coverage", () => {
  it("routes every spec trigger event", () => {
    const registry = registryEvents();
    const unrouted = [...specTriggerEvents()].filter((event) => !registry.has(event));
    expect(unrouted).toEqual([]);
  });

  it("only routes spec events or documented wire-only events", () => {
    const spec = specTriggerEvents();
    const unknown = [...registryEvents()].filter((event) => !spec.has(event) && !WIRE_ONLY_EVENTS.has(event));
    expect(unknown).toEqual([]);
  });

  it("keeps the wire-only allowlist free of events the spec has adopted", () => {
    const spec = specTriggerEvents();
    const adopted = [...WIRE_ONLY_EVENTS].filter((event) => spec.has(event));
    expect(adopted).toEqual([]);
  });
});
