import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const MODEL_CALL_PATTERN =
  /\b(?:streamText|generateText|generateObject|streamObject|embed|embedMany)\s*\(|\bnew\s+(?:Agent|WorkflowAgent|ToolLoopAgent)\s*\(/;
const PROVIDER_FACTORY_PATTERN =
  /\b(?:createOpenAI|createAnthropic|createGoogleGenerativeAI|createGateway|createProviderRegistry|customProvider|wrapProvider)\s*\(/;
const APPROVED_MODEL_CALL_FILES = [
  "ee/agent-chat/structured-model-call.ts",
  "ee/agent-runtime/run-agent-job-loop.ts",
  "ee/wiki-retrieval/wiki-embedding-model.ts",
  "workflows/agent-turn.ts",
];
const APPROVED_PROVIDER_FACTORY_FILES = ["ee/agent-runtime/create-own-key-model.ts"];

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

  it("reaches the classifier runners only through the metered entry point that charges the turn", () => {
    const unmeteredClassifierCall = /\b(?:classifyAttempt|runJev)\s*\(/;
    const outsideClassifier = (path: string) => !path.startsWith("ee/agent-chat/classifier/");

    expect(matchingProductionFiles(unmeteredClassifierCall).filter(outsideClassifier)).toEqual([]);
    expect(matchingProductionFiles(/\bclassifyMetered\s*\(/).filter(outsideClassifier)).toEqual([
      "ee/agent-chat/docs-rerank.ts",
      "ee/wiki-crawl/wiki-website-synthesis.service.ts",
    ]);
    const workflow = readFileSync(`${REPO_ROOT}/workflows/agent-turn.ts`, "utf8");
    expect(workflow).toContain("agentAuxiliaryCharge(auxiliaryCharges).costMicrocents");
  });

  it("constructs a provider instance only for a workspace's own key, so no api key can reach a durable step argument", () => {
    expect(matchingProductionFiles(PROVIDER_FACTORY_PATTERN)).toEqual(APPROVED_PROVIDER_FACTORY_FILES);

    const importers = matchingProductionFiles(/create-own-key-model/).filter(
      (path) => !APPROVED_PROVIDER_FACTORY_FILES.includes(path),
    );
    expect(importers).toEqual(["core/di.ts", "ee/agent-runtime/run-agent-job.interactor.ts"]);

    const workflow = readFileSync(`${REPO_ROOT}/workflows/run-agent-job.ts`, "utf8");
    const payload = /export type RunAgentJobWorkflowPayload = \{([^}]*)\}/.exec(workflow)?.[1] ?? "";
    expect(payload.match(/^\s*(\w+)\??:/gm)?.map((field) => field.trim()) ?? []).toEqual([
      "jobId:",
      "companyId:",
      "ownerUserId:",
      "tenant?:",
    ]);
    expect(workflow).not.toMatch(/apiKey|keyCiphertext|openSecret/);
  });

  it("settles every hosted agent job run through a credit reservation and never calls a provider without one", () => {
    const interactor = readFileSync(`${REPO_ROOT}/ee/agent-runtime/run-agent-job.interactor.ts`, "utf8");

    expect(interactor).toContain("this.credits.reserve(");
    expect(interactor).toContain("this.credits.settle(");
    expect(interactor).toContain("this.credits.release(");
    expect(interactor).toContain("outOfBudget");
  });

  it("addresses models by gateway id from the catalog rather than by a hardcoded string", () => {
    const workflow = readFileSync(`${REPO_ROOT}/workflows/agent-turn.ts`, "utf8");

    expect(workflow).toContain("model: payload.turnBudget.modelSpec");
    expect(workflow).toMatch(/getAgentProviderOptions\(\s*payload\.turnBudget\.servingProvider,\s*payload\.turnBudget\.inferenceRegion,?\s*\)/);
    const options = readFileSync(`${REPO_ROOT}/ee/agent-chat/agent-provider-options.ts`, "utf8");
    expect(options).toContain("only: [servingProvider]");
    expect(options).toContain('scope: "zone"');
    expect(options).toContain("geoRegion: inferenceRegion");
    expect(options).toContain("zeroDataRetention: true");
    expect(options).toContain("disallowPromptTraining: true");
    expect(options).toContain('caching: "auto"');
    expect(workflow).toContain("reasoning: payload.turnBudget.reasoningEffort");
    expect(workflow).not.toContain("thinkingConfig");
  });

  it("meters every Wiki embedding call and pins it to one zero-retention serving provider", () => {
    const embeddings = readFileSync(`${REPO_ROOT}/ee/wiki-retrieval/wiki-embedding-model.ts`, "utf8");
    const service = readFileSync(`${REPO_ROOT}/ee/wiki-retrieval/wiki-embedding.service.ts`, "utf8");
    const spend = readFileSync(`${REPO_ROOT}/ee/wiki-retrieval/wiki-index-spend.ts`, "utf8");

    expect(embeddings).toContain("only: [WIKI_EMBEDDING_SERVING_PROVIDER]");
    expect(embeddings).toContain("zeroDataRetention: true");
    expect(embeddings).toContain("disallowPromptTraining: true");
    expect(embeddings).toContain("readAgentProviderCharge(metadata, WIKI_EMBEDDING_SERVING_PROVIDER)");
    expect(service).toContain("this.usage.prepareRetrieval(payer.id)");
    expect(service).toContain("this.usage.prepareWorkspaceIndexing(companyId, purpose)");
    expect(service).toContain("await reserveWikiIndexSpend(this.usage, {");
    expect(service).toContain('await spend.settle(embedded.charge, used() ? "grant" : "platform")');
    expect(service).toContain('await spend.settle(attemptedCharge, "platform")');
    expect(spend).toContain("await usage.reserveRetrieval(");
    expect(spend).toContain("usage.settleRetrieval({ reservation, charge, payer })");
    expect(spend).toContain('purpose: "wikiReindex"');
  });
});
