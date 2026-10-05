import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const MODEL_CALL_PATTERN =
  /\b(?:streamText|generateText|generateObject|streamObject|embed|embedMany)\s*\(|\bnew\s+(?:Agent|WorkflowAgent|ToolLoopAgent)\s*\(/;
const PROVIDER_FACTORY_PATTERN =
  /\b(?:createOpenAI|createAnthropic|createGoogleGenerativeAI|createGateway|createProviderRegistry|customProvider|wrapProvider)\s*\(/;
const APPROVED_PROVIDER_FACTORY_FILES = ["ee/agent-chat/ovh-ai-endpoints.ts"];
const APPROVED_MODEL_CALL_FILES = [
  "ee/agent-chat/classifier/ovh-runner.ts",
  "ee/wiki-crawl/wiki-synthesis-model.ts",
  "ee/wiki-retrieval/wiki-embedding-model.ts",
  "workflows/agent-turn.ts",
];

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
    const unmeteredClassifierCall = /\b(?:classifyAttempt|runJev|runOvhClassifier)\s*\(/;
    const outsideClassifier = (path: string) => !path.startsWith("ee/agent-chat/classifier/");

    expect(matchingProductionFiles(unmeteredClassifierCall).filter(outsideClassifier)).toEqual([]);
    expect(matchingProductionFiles(/\bclassifyMetered\s*\(/).filter(outsideClassifier)).toEqual([
      "ee/agent-chat/docs-rerank.ts",
      "ee/wiki-crawl/wiki-website-synthesis.service.ts",
    ]);
    const workflow = readFileSync(`${REPO_ROOT}/workflows/agent-turn.ts`, "utf8");
    expect(workflow).toContain("agentAuxiliaryCharge(auxiliaryCharges).costMicrocents");

    const runner = readFileSync(`${REPO_ROOT}/ee/agent-chat/classifier/ovh-runner.ts`, "utf8");
    expect(runner).toContain("model: createOvhLanguageModel(options.model, {");
    expect(runner).toContain("maxRetries: 0");
    expect(runner).not.toMatch(/ai-gateway\.vercel\.sh/);
  });

  it("constructs a provider instance only in the audited direct-provider module, so no api key can reach a durable step argument", () => {
    expect(matchingProductionFiles(PROVIDER_FACTORY_PATTERN)).toEqual(APPROVED_PROVIDER_FACTORY_FILES);

    const ovh = readFileSync(`${REPO_ROOT}/ee/agent-chat/ovh-ai-endpoints.ts`, "utf8");
    expect(ovh.match(/\bcreateOpenAI\s*\(/g)).toHaveLength(1);
    expect(ovh).toContain("baseURL: OVH_AI_ENDPOINTS_BASE_URL");
    expect(ovh).toContain(".chat(nativeModelId)");
    expect(ovh).toContain("env.OVH_AI_ENDPOINTS_API_KEY");

    const workflow = readFileSync(`${REPO_ROOT}/workflows/agent-turn.ts`, "utf8");
    expect(workflow).not.toContain("ovh-ai-endpoints\"");
    const patch = readFileSync(`${REPO_ROOT}/patches/@ai-sdk+workflow+2.0.25.patch`, "utf8");
    expect(patch).toContain("Symbol.for('ai-sdk.workflow.resolveLanguageModel')");
    expect(patch).toContain("if (typeof modelInit === 'string' && hostModel == null && modelInit.startsWith('ovh/'))");
    expect(patch).toContain("throw new Error(`No host language model resolver serves \"${modelInit}\".`);");
    expect(ovh).toContain('Symbol.for("ai-sdk.workflow.resolveLanguageModel")');
    const instrumentation = readFileSync(`${REPO_ROOT}/instrumentation.ts`, "utf8");
    expect(instrumentation).toContain("installAgentLanguageModelResolver()");
    const synthesis = readFileSync(`${REPO_ROOT}/ee/wiki-crawl/wiki-synthesis-model.ts`, "utf8");
    expect(synthesis).toContain("languageModel = resolveAgentLanguageModel(args.model.modelId) ?? args.model.modelId");
    expect(synthesis).toContain("model: languageModel,");
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
    expect(options).toContain("parallelToolCalls: false");
    expect(options).toContain("store: false");
    expect(options).toContain("if (!agentServingProviderUsesGateway(servingProvider))");
    expect(workflow).toContain("...googleThinkingProviderOptions(payload.turnBudget)");
  });

  it("meters every Wiki embedding call and pins it to one zero-retention serving provider", () => {
    const embeddings = readFileSync(`${REPO_ROOT}/ee/wiki-retrieval/wiki-embedding-model.ts`, "utf8");
    const service = readFileSync(`${REPO_ROOT}/ee/wiki-retrieval/wiki-embedding.service.ts`, "utf8");

    expect(embeddings).toContain("only: [WIKI_EMBEDDING_SERVING_PROVIDER]");
    expect(embeddings).toContain("zeroDataRetention: true");
    expect(embeddings).toContain("disallowPromptTraining: true");
    expect(embeddings).toContain("readAgentProviderCharge(metadata, WIKI_EMBEDDING_SERVING_PROVIDER)");
    expect(service).toContain("this.usage.prepareRetrieval(payer.id)");
    expect(service).toContain("this.usage.prepareWorkspaceIndexing(companyId)");
    expect(service).toContain("await this.usage.reserveRetrieval(");
    expect(service).toContain(
      'await this.usage.settleRetrieval({ reservation, charge: embedded.charge, payer: used() ? "grant" : "platform" })',
    );
    expect(service).toContain('await this.usage.settleRetrieval({ reservation, charge: attemptedCharge, payer: "platform" })');
  });
});
