import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

// Helpers called from the agent-turn workflow body (outside "use step") run in the workflow sandbox, which cannot
// load the generated Prisma client. Their runtime import graph must stay free of it.
const WORKFLOW_BODY_MODULES = [
  "ee/agent-chat/agent-tool-navigation.ts",
  "ee/agent-chat/agent-durable-stream.ts",
  "ee/agent-chat/agent-turn-transcript.ts",
  "ee/agent-chat/agent-failure-message.ts",
  "ee/agent-chat/agent-approval-guard.ts",
];

const RUNTIME_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")])
    if (existsSync(candidate)) return candidate;
  return base;
}

function prismaChain(start: string): string[] | null {
  const parent = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (file.includes(`${path.sep}generated${path.sep}prisma`)) {
      const chain: string[] = [];
      for (let at: string | null | undefined = file; at; at = parent.get(at)) chain.push(path.relative(ROOT, at));
      return chain;
    }
    if (!file.endsWith(".ts") || !existsSync(file)) continue;
    for (const match of readFileSync(file, "utf8").matchAll(RUNTIME_IMPORT)) {
      const next = resolveImport(file, match[1]);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return null;
}

describe("agent-turn workflow body helpers", () => {
  it.each(WORKFLOW_BODY_MODULES)("%s does not import the generated Prisma client", (module) => {
    expect(prismaChain(path.join(ROOT, module))).toBeNull();
  });
});
