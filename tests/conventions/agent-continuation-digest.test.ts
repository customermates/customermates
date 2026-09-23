import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = readFileSync(join(root, "workflows/agent-turn.ts"), "utf8");

const COMPACTION_CALL = /compactAgentContinuationContext\(\{([\s\S]*?)\}\)/g;

describe("the agent turn compacts with a result digest", () => {
  it("calls the compaction helper at least once", () => {
    expect([...source.matchAll(COMPACTION_CALL)]).not.toHaveLength(0);
  });

  it("asks for the result digest at every compaction call site", () => {
    for (const [, args] of source.matchAll(COMPACTION_CALL)) expect(args).toContain("resultDigest: true");
  });
});
