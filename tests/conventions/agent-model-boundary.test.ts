import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const MODEL_CALL_PATTERN =
  /\b(?:streamText|generateText|generateObject|streamObject|embed|embedMany)\s*\(|\bnew\s+(?:Agent|WorkflowAgent|ToolLoopAgent)\s*\(/;
const PROVIDER_FACTORY_PATTERN =
  /\b(?:createOpenAI|createAnthropic|createGoogleGenerativeAI|createGateway|createProviderRegistry|customProvider|wrapProvider)\s*\(/;
const APPROVED_MODEL_CALL_FILES = ["workflows/agent-turn.ts"];

function productionTypeScriptFiles() {
  return walkFiles(REPO_ROOT, (path) => {
    if (!/\.[cm]?[jt]sx?$/.test(path)) return false;
    const repoPath = relative(REPO_ROOT, path);
    return (
      !repoPath.includes("/__tests__/") &&
      !repoPath.startsWith("tests/") &&
      !repoPath.startsWith("scripts/") &&
      !repoPath.includes(".test.")
    );
  });
}

function matchingProductionFiles(pattern: RegExp) {
  return productionTypeScriptFiles()
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(REPO_ROOT, path))
    .sort();
}

describe("agent model budget boundary", () => {
  it("keeps every production model invocation behind a metered turn runner", () => {
    expect(matchingProductionFiles(MODEL_CALL_PATTERN)).toEqual([...APPROVED_MODEL_CALL_FILES].sort());
  });

  it("never constructs a provider instance, so no api key can reach a durable step argument", () => {
    expect(matchingProductionFiles(PROVIDER_FACTORY_PATTERN)).toEqual([]);
  });

  it("keeps routine cleanup deterministic and free of model or provider calls", () => {
    const analyzer = readFileSync(`${REPO_ROOT}/workflows/analyze-routine-loops.ts`, "utf8");

    expect(analyzer).not.toMatch(MODEL_CALL_PATTERN);
    expect(analyzer).not.toMatch(/\bfrom ["']ai["']|MODEL_CATALOG|servingProvider|providerOptions/);
    expect(analyzer).toContain("findings: []");
  });

  it("addresses models by gateway id from the catalog rather than by a hardcoded string", () => {
    const workflow = readFileSync(`${REPO_ROOT}/workflows/agent-turn.ts`, "utf8");

    expect(workflow).toContain("model: payload.turnBudget.modelSpec");
    expect(workflow).toContain("gateway: { only: [payload.turnBudget.servingProvider] }");
  });
});
