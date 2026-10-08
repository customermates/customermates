import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const TYPE_CHECK_HEAP_MB = 6144;
const HEADROOM_SHARE = 0.8;

const scripts: Record<string, string> = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts;

function heapOf(command: string) {
  const sizes = [...command.matchAll(/--max-old-space-size=(\d+)/g)].map(([, size]) => Number(size));
  return sizes.at(-1);
}

describe("type checking heap", () => {
  it("runs tsc with an explicit heap, because the default Node heap on CI runners is too small", () => {
    expect(scripts.typecheck).toContain("node_modules/typescript/bin/tsc --noEmit");
    expect(heapOf(scripts.typecheck)).toBe(TYPE_CHECK_HEAP_MB);
  });

  it("type checks the production build with the same heap", () => {
    expect(scripts.build).toMatch(/NODE_OPTIONS="\$\{NODE_OPTIONS:-\} --max-old-space-size=\d+" next build$/);
    expect(heapOf(scripts.build)).toBe(TYPE_CHECK_HEAP_MB);
  });

  it("offers a cold headroom check that fails before type checking outgrows the explicit heap", () => {
    expect(scripts["typecheck:headroom"]).toContain("node_modules/typescript/bin/tsc --noEmit --incremental false");
    expect(heapOf(scripts["typecheck:headroom"])).toBe(Math.round(TYPE_CHECK_HEAP_MB * HEADROOM_SHARE));
  });

  it("type checks commits through the same script", () => {
    const hook = readFileSync(join(REPO_ROOT, ".husky", "pre-commit"), "utf8");

    expect(hook).toContain("yarn run typecheck");
    expect(hook).not.toMatch(/^tsc\b/m);
  });
});
