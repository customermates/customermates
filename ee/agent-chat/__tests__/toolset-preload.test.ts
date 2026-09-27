import { describe, expect, it } from "vitest";

import { agentContextProviderPrefix } from "../agent-context";
import { agentPageContextPrefix } from "../agent-page-context";
import { AGENT_ON_DEMAND_TOOLSETS, AGENT_TOOLSET_SUMMARY, lexiconOnlyToolsets } from "../agent-toolset-routing";
import { buildAgentTurnClassifierTrace, isAgentTurnClassifierTrace } from "../agent-classifier-trace";
import {
  TOOLSET_PRELOAD_MAX_ADDED,
  TOOLSET_PRELOAD_TEXT_CHARS,
  TOOLSET_REMOVE_MAX_PROBABILITY,
  TOOLSET_ROUTING_TUNED_SUMMARY,
  decideParallelToolsetRouting,
  latestUserRequestText,
  predictedToolsets,
  rejectedToolsets,
  selectPreloadToolsets,
  toolsetPreloadSpec,
} from "../toolset-preload";

function booleans(values: Record<string, boolean | number>) {
  return {
    model: "gemini" as const,
    answers: Object.fromEntries(
      Object.entries(values).map(([id, value]) => [
        id,
        typeof value === "number"
          ? { type: "boolean" as const, value: value >= 0.5, probability: value }
          : { type: "boolean" as const, value, probability: null },
      ]),
    ),
    costMicrocents: 1,
    latencyMs: 1,
  };
}

describe("toolset preload spec", () => {
  it("asks the evaluated boolean question per on-demand toolset with the product summaries", () => {
    const spec = toolsetPreloadSpec();

    expect(spec.id).toBe("toolset-routing");
    expect(spec.questions.map((question) => question.id)).toEqual(
      AGENT_ON_DEMAND_TOOLSETS.map((toolset) => `toolset_${toolset}`),
    );
    expect(spec.questions.every((question) => question.type === "boolean")).toBe(true);
    expect(spec.questions[0].instruction).toBe(
      `The assistant always has tools for records (contacts, organizations, deals, services, tasks: reading, counting, creating, updating, deleting, notes and links), documentation, custom fields and support. Does handling \`latest_user_message\` need the additional "views" tool set (${AGENT_TOOLSET_SUMMARY.views})? Words that are part of a record, company or person name are data, not a request.`,
    );
  });

  it("predicts a toolset at the classifier's 0.5 threshold and nothing on failure", () => {
    expect(predictedToolsets(booleans({ toolset_views: 0.49, toolset_webhooks: 0.5, toolset_admin: true }))).toEqual([
      "webhooks",
      "admin",
    ]);
    expect(predictedToolsets(null)).toBeNull();
  });
});

describe("toolset preload input", () => {
  it("classifies only the latest user text, without page or selected context", () => {
    const prefix = `${agentPageContextPrefix("/en/deals")}${agentContextProviderPrefix([
      {
        reference: { kind: "record", entityType: "deal", recordId: "3f2c1f5e-8b52-4d77-9f0e-0f4a9b8c2d11" },
        label: "Deal",
      },
    ])}`;
    const messages = [
      { role: "user", text: "first question" },
      { role: "assistant", text: "an answer" },
      { role: "user", text: `${prefix}Send a webhook when this deal is won` },
    ];

    expect(prefix).toContain("<page_context");
    expect(latestUserRequestText(messages)).toBe("Send a webhook when this deal is won");
  });

  it("caps the classified text and skips an empty request", () => {
    expect(latestUserRequestText([{ role: "user", text: "x".repeat(TOOLSET_PRELOAD_TEXT_CHARS + 50) }])).toHaveLength(
      TOOLSET_PRELOAD_TEXT_CHARS,
    );
    expect(latestUserRequestText([{ role: "user", text: `${agentPageContextPrefix("/en/deals")}   ` }])).toBeNull();
    expect(latestUserRequestText([{ role: "assistant", text: "hello" }])).toBeNull();
  });
});

describe("toolset preload selection", () => {
  it("adds predicted sets the lexicon missed, never removes a lexicon set, and adds at most two", () => {
    const added = selectPreloadToolsets({
      lexicon: ["views"],
      predicted: ["messaging", "widgets", "webhooks", "admin"],
      fits: () => true,
    });

    expect(TOOLSET_PRELOAD_MAX_ADDED).toBe(2);
    expect(added).toEqual(["messaging", "widgets"]);
  });

  it("skips a set whose tools would no longer fit the context envelope", () => {
    const added = selectPreloadToolsets({
      lexicon: [],
      predicted: ["messaging", "webhooks", "admin"],
      fits: (toolsets) => !toolsets.includes("messaging"),
    });

    expect(added).toEqual(["webhooks", "admin"]);
  });

  it("adds nothing when every prediction is already loaded", () => {
    expect(selectPreloadToolsets({ lexicon: ["routines"], predicted: ["routines"], fits: () => true })).toEqual([]);
  });
});

describe("turn classifier trace", () => {
  it("records preload sets and docs re-rank calls with their summed cost, never text", () => {
    const preload = {
      model: "jev" as const,
      answered: true,
      lexicon: ["views"],
      predicted: ["views", "webhooks"],
      added: ["webhooks"],
      costMicrocents: 300,
      measured: true,
    };
    const trace = buildAgentTurnClassifierTrace(preload, [
      { use: "toolset_preload", model: "jev", costMicrocents: 300, measured: true, answered: true },
      { use: "docs_rerank", model: "jev", costMicrocents: 1_600, measured: true, answered: true },
      { use: "docs_rerank", model: "jev", costMicrocents: 900, measured: false, answered: false },
    ]);

    expect(trace).toEqual({
      auxiliaryCostMicrocents: 2_800,
      auxiliaryMeasured: false,
      toolsetPreload: preload,
      docsRerank: { model: "jev", calls: 2, answered: 1, costMicrocents: 2_500, measured: false },
    });
    expect(isAgentTurnClassifierTrace(trace)).toBe(true);
    expect(buildAgentTurnClassifierTrace(null, [])).toBeNull();
    const empty = { auxiliaryCostMicrocents: 0, auxiliaryMeasured: true, toolsetPreload: null, docsRerank: null };
    expect(isAgentTurnClassifierTrace(empty)).toBe(true);
    expect(isAgentTurnClassifierTrace({ ...empty, auxiliaryCostMicrocents: -1 })).toBe(false);
  });
});

describe("toolset routing v2", () => {
  it("uses the tuned wording from the offline probe for the sets it changed, and the product summary for the rest", () => {
    const spec = toolsetPreloadSpec(TOOLSET_ROUTING_TUNED_SUMMARY);
    const instruction = (toolset: string) =>
      spec.questions.find((question) => question.id === `toolset_${toolset}`)?.instruction ?? "";

    expect(instruction("views")).toContain("not computing or comparing figures");
    expect(instruction("messaging")).toContain("not a summary the CRM sends by itself");
    expect(instruction("admin")).toContain("not questions about how the product works");
    expect(instruction("social")).toContain(AGENT_TOOLSET_SUMMARY.social);
    expect(instruction("widgets")).toContain(AGENT_TOOLSET_SUMMARY.widgets);
  });

  it("rejects a set only on a measured probability at or below 0.1", () => {
    expect(TOOLSET_REMOVE_MAX_PROBABILITY).toBe(0.1);
    expect(
      rejectedToolsets(
        booleans({ toolset_views: 0.05, toolset_messaging: 0.1, toolset_social: 0.11, toolset_widgets: 0.9 }),
      ),
    ).toEqual(["views", "messaging"]);
    expect(rejectedToolsets(booleans({ toolset_views: false }))).toEqual([]);
    expect(rejectedToolsets(null)).toEqual([]);
  });

  it("removes rejected lexicon sets the model has not used, keeps pinned and used ones, and adds at most two", () => {
    const decision = decideParallelToolsetRouting({
      loaded: ["views", "messaging", "social", "widgets"],
      removable: ["views", "messaging", "social"],
      used: ["messaging"],
      predicted: ["webhooks", "routines", "admin"],
      rejected: ["views", "messaging", "widgets"],
      fits: () => true,
    });

    expect(decision.removed).toEqual(["views"]);
    expect(decision.added).toEqual(["webhooks", "routines"]);
    expect(decision.toolsets).toEqual(["messaging", "social", "widgets", "webhooks", "routines"]);
  });

  it("never removes a set loaded with load_toolset, and adds only while the context still fits", () => {
    const decision = decideParallelToolsetRouting({
      loaded: ["views"],
      removable: ["views"],
      used: ["views", "social"],
      predicted: ["social", "webhooks", "admin"],
      rejected: ["views"],
      fits: (toolsets) => !toolsets.includes("webhooks"),
    });

    expect(decision).toEqual({ removed: [], added: ["admin"], toolsets: ["views", "admin"] });
  });

  it("treats only sets matched by the lexicon in the user's words as removable", () => {
    expect(
      lexiconOnlyToolsets({ texts: ["Email Anna about the dashboard", "Create a webhook"], pinned: ["widgets"] }),
    ).toEqual(["messaging", "webhooks"]);
  });

  it("records the v2 decisions and the prompt bytes of every round", () => {
    const preload = {
      model: "jev" as const,
      answered: true,
      lexicon: ["views"],
      predicted: ["webhooks"],
      added: ["webhooks"],
      costMicrocents: 300,
      measured: true,
      mode: "parallel-v2" as const,
      rejected: ["views"],
      removed: ["views"],
      appliedAtRound: 1,
    };
    const trace = buildAgentTurnClassifierTrace(
      preload,
      [
        { use: "toolset_preload", model: "jev", costMicrocents: 300, measured: true, answered: true },
        { use: "guard_bulk", model: "jev", costMicrocents: 50, measured: true, answered: true },
      ],
      { promptBytesByRound: [12_000, 9_000], guardCovered: 1 },
    );

    expect(trace).toEqual({
      auxiliaryCostMicrocents: 350,
      auxiliaryMeasured: true,
      toolsetPreload: preload,
      docsRerank: null,
      guardBulk: { model: "jev", calls: 1, answered: 1, costMicrocents: 50, measured: true, covered: 1 },
      promptBytesByRound: [12_000, 9_000],
    });
    expect(isAgentTurnClassifierTrace(trace)).toBe(true);
    expect(buildAgentTurnClassifierTrace(null, [], { promptBytesByRound: [5_000] })).toEqual({
      auxiliaryCostMicrocents: 0,
      auxiliaryMeasured: true,
      toolsetPreload: null,
      docsRerank: null,
      promptBytesByRound: [5_000],
    });
    expect(isAgentTurnClassifierTrace({ ...trace, promptBytesByRound: [-1] })).toBe(false);
  });
});
