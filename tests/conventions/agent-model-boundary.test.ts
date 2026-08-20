import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const MODEL_CALL_PATTERN =
  /\b(?:streamText|generateText|generateObject|embed|embedMany)\s*\(/;
const LANE_MODEL_CALL_PATTERN = /\blaneModel\s*\(/;
const APPROVED_MODEL_CALL_FILE = "ee/agent-chat/agent-runner.ts";

function productionTypeScriptFiles() {
  return walkFiles(REPO_ROOT, (path) => {
    if (!/\.[cm]?[jt]sx?$/.test(path)) return false;
    const repoPath = relative(REPO_ROOT, path);
    return (
      !repoPath.includes("/__tests__/") &&
      !repoPath.startsWith("tests/") &&
      !repoPath.includes(".test.")
    );
  });
}

describe("agent model budget boundary", () => {
  it("keeps every production model invocation behind the metered agent runner", () => {
    const modelCallers = productionTypeScriptFiles()
      .filter((path) => MODEL_CALL_PATTERN.test(readFileSync(path, "utf8")))
      .map((path) => relative(REPO_ROOT, path));

    expect(modelCallers).toEqual([APPROVED_MODEL_CALL_FILE]);
  });

  it("does not let another production module obtain the agent model directly", () => {
    const laneModelCallers = productionTypeScriptFiles()
      .filter((path) =>
        LANE_MODEL_CALL_PATTERN.test(readFileSync(path, "utf8")),
      )
      .map((path) => relative(REPO_ROOT, path));

    expect(laneModelCallers.sort()).toEqual(
      [APPROVED_MODEL_CALL_FILE, "ee/agent-chat/llm.service.ts"].sort(),
    );
  });
});
