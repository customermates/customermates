import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const SERVER_ONLY_KEY_PATTERN = /model|token|microcent|usd|dollar|provider|pricing/i;
const RAW_CREDIT_KEY_PATTERN = /credit/i;
const RAW_CREDIT_SOURCE_PATTERN = /creditsUsed|creditsRemaining|creditsLimit|recentTurnCredits|formatAgentCredits/;
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
  it("keeps model identifiers, dollars, tokens and raw credit amounts out of the usage view the browser receives", () => {
    const keys = objectLiteralKeys(
      readRepoFile("ee/agent-chat/agent-usage.service.ts"),
      "export const AgentUsageViewSchema = z.object(",
    );

    expect(keys).toEqual([
      "hasAllowance",
      "usedPct",
      "multiplier",
      "plan",
      "resetAt",
      "recentTurnPct",
      "blockedReason",
    ]);
    expect(keys.filter((key) => SERVER_ONLY_KEY_PATTERN.test(key) || RAW_CREDIT_KEY_PATTERN.test(key))).toEqual([]);
  });

  it("sends routine runs to the browser and MCP clients with a usage share, never a raw credit amount", () => {
    const keys = objectLiteralKeys(
      readRepoFile("ee/routines/routine.schema.ts"),
      "export const RoutineRunDtoSchema = z.object(",
    );

    expect(keys).toContain("chargedPct");
    expect(keys.filter((key) => SERVER_ONLY_KEY_PATTERN.test(key) || RAW_CREDIT_KEY_PATTERN.test(key))).toEqual([]);

    const repository = readRepoFile("ee/routines/prisma-routine.repository.ts");
    const projection = repository.slice(repository.indexOf("function routineRunDto("));
    expect(projection.slice(0, projection.indexOf("\n}\n"))).not.toMatch(/agentMicrocentsToCredits|Credits:/);
  });

  it("sends the agent config usage as the percentage view, never the credit summary", () => {
    const config = readRepoFile("ee/agent-chat/get-agent-config.interactor.ts");

    expect(config).toContain("usage: AgentUsageViewSchema,");
    expect(config).toContain("usage: toAgentUsageView(usage),");
    expect(config).not.toContain("AgentUsageSummarySchema");
  });

  it("emits no raw credit amount in the turn stream the browser reads", () => {
    const stream = readRepoFile("ee/agent-chat/agent-durable-stream.ts");
    const turnDone = stream.slice(stream.indexOf('type: "turn_done";'));
    const open = turnDone.indexOf("{");
    const keys = [...turnDone.slice(open, turnDone.indexOf("};", open)).matchAll(/^\s+([A-Za-z]\w*)\??:/gm)].map(
      (match) => match[1],
    );

    expect(keys).toContain("numTurns");
    expect(keys.filter((key) => RAW_CREDIT_KEY_PATTERN.test(key))).toEqual([]);
  });

  it("never reads a raw credit amount in the chat browser bundle", () => {
    const offending = agentChatClientFiles()
      .filter((path) => RAW_CREDIT_SOURCE_PATTERN.test(readFileSync(path, "utf8")))
      .map((path) => relative(REPO_ROOT, path));

    expect(offending).toEqual([]);
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
