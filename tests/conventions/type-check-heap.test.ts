import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const TYPE_CHECK_HEAP_MB = 9216;
const HEADROOM_SHARE = 0.8;

const scripts: Record<string, string> = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts;

function heapOf(command: string) {
  const sizes = [...command.matchAll(/--max-old-space-size=(?:\$\{NEXT_BUILD_HEAP_MB:-)?(\d+)/g)].map(([, size]) =>
    Number(size),
  );
  return sizes.at(-1);
}

describe("type checking heap", () => {
  it("runs tsc with an explicit heap, because the default Node heap on CI runners is too small", () => {
    expect(scripts.typecheck).toContain("node_modules/typescript/bin/tsc --noEmit");
    expect(heapOf(scripts.typecheck)).toBe(TYPE_CHECK_HEAP_MB);
  });

  it("type checks the production build with the same heap", () => {
    expect(scripts.build).toMatch(
      /NODE_OPTIONS="\$\{NODE_OPTIONS:-\} --max-old-space-size=\$\{NEXT_BUILD_HEAP_MB:-\d+\}" next build --webpack$/,
    );
    expect(heapOf(scripts.build)).toBe(TYPE_CHECK_HEAP_MB);
  });

  it("skips next build's type check only on Vercel and in CI's browser build, and lowers the heap only on Vercel", () => {
    const config = readFileSync(join(REPO_ROOT, "next.config.ts"), "utf8");
    const vercelBuild = readFileSync(join(REPO_ROOT, "scripts", "vercel-build.sh"), "utf8");
    const e2e = readFileSync(join(REPO_ROOT, ".github", "workflows", "e2e.yml"), "utf8");
    const tests = readFileSync(join(REPO_ROOT, ".github", "workflows", "test.yml"), "utf8");

    expect(config).toContain(
      'typescript: { ignoreBuildErrors: process.env.VERCEL === "1" || process.env.NEXT_SKIP_TYPECHECK === "1" }',
    );
    expect(e2e.match(/NEXT_SKIP_TYPECHECK: "1"/g)).toHaveLength(1);
    expect(e2e).toMatch(/APP_MODE: \$\{\{ matrix\.mode \}\}\n(?:\s+#.*\n)*\s+NEXT_SKIP_TYPECHECK: "1"/);
    // The type check the build skips still runs in the static job, which the plan selects whenever it builds.
    expect(tests).toContain("- run: yarn typecheck");
    expect(vercelBuild).toMatch(/^export NEXT_BUILD_HEAP_MB="\$\{NEXT_BUILD_HEAP_MB:-\d+\}"$/m);
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
