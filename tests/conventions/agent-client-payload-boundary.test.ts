import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const SERVER_ONLY_KEY_PATTERN = /model|token|microcent|usd|dollar|provider|pricing/i;
const SERVER_ONLY_SOURCE_PATTERN = /microcent|costUsd|inferenceCost|PerMTok|modelSpec|servingProvider/;

function readRepoFile(repoPath: string) {
  return readFileSync(join(REPO_ROOT, repoPath), "utf8");
}

function objectLiteralKeys(source: string, declaration: string) {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`${declaration} no longer exists; re-anchor this guard.`);

  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < source.length; end += 1) {
    if (source[end] === "{") depth += 1;
    else if (source[end] === "}" && (depth -= 1) === 0) break;
  }

  return [...source.slice(open, end).matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)].map((match) => match[1]);
}

function agentChatClientFiles() {
  return walkFiles(join(REPO_ROOT, "app/components/agent-chat"), (path) => /\.tsx?$/.test(path)).filter(
    (path) => !path.includes("/__tests__/"),
  );
}

describe("agent client payload boundary", () => {
  it("keeps model identifiers, dollars and tokens out of the credit summary the browser receives", () => {
    const keys = objectLiteralKeys(
      readRepoFile("ee/agent-chat/agent-usage.service.ts"),
      "export const AgentUsageSummarySchema = z.object(",
    );

    expect(keys.length).toBeGreaterThan(5);
    expect(keys.filter((key) => SERVER_ONLY_KEY_PATTERN.test(key))).toEqual([]);
  });

  it("never names a catalog model in a browser bundle", () => {
    const modelIds = [...readRepoFile("ee/agent-chat/model-catalog.ts").matchAll(/modelId: "([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(modelIds.length).toBeGreaterThan(0);

    const offending = agentChatClientFiles()
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return modelIds.some((modelId) => source.includes(modelId));
      })
      .map((path) => relative(REPO_ROOT, path));

    expect(offending).toEqual([]);
  });

  it("never reads a cost, token or provider field in a browser bundle", () => {
    const files = agentChatClientFiles();
    expect(files.length).toBeGreaterThan(0);

    const offending = files
      .filter((path) => SERVER_ONLY_SOURCE_PATTERN.test(readFileSync(path, "utf8")))
      .map((path) => relative(REPO_ROOT, path));

    expect(offending).toEqual([]);
  });
});
