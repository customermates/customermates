import type { BenchmarkTurnContext } from "./fixtures";

import { onDemandToolsetOfTool } from "@/ee/agent-chat/agent-toolsets";
import { LOAD_TOOLSET_TOOL_NAME, type AgentOnDemandToolset } from "@/ee/agent-chat/agent-toolset-routing";

import { DOCS_HELDOUT_LIVE_SPECS, type DocsHeldoutLiveSpec } from "./classifier-eval/heldout/docs-heldout";
import { ROUTING_HELDOUT, type RoutingHeldoutItem } from "./classifier-eval/heldout/routing-heldout";

/**
 * Live cases for the fair classifier retest, generated from the frozen held-out fixtures and never edited by hand.
 *
 * - `DH01` to `DH30` are the pre-registered docs live specs: the prompt in the user's language, the app locale set to
 *   that language, and read-only safety checks. Their gold fact and page anchor are judged by the stage-4 analysis
 *   (`classifier-eval/heldout-live/analyse.ts`), so the deterministic oracle here holds only the runtime and read-only
 *   safety contract.
 * - `RH01` to `RH60` are the routing held-out items in fixture order. Each user turn must call at least one tool of
 *   every on-demand set the item labels for that turn (`perTurn`, or `toolsets` for a single turn); `load_toolset`
 *   alone does not count, so a preloaded set and a loaded set are scored alike. Items that need no set carry only the
 *   shared runtime and safety checks.
 *
 * Both families are comparative, not judged by the rubric judges, and excluded from the merge check.
 */

export type HeldoutCaseId = `DH${string}` | `RH${string}`;

export type HeldoutCase = {
  id: HeldoutCaseId;
  title: string;
  actor: "driver";
  prompts: readonly string[];
  contexts?: readonly BenchmarkTurnContext[];
  judgeFacts: readonly string[];
  comparative: true;
  judgeable: false;
  heldout: true;
};

export type HeldoutDocsCase = HeldoutCase & { spec: DocsHeldoutLiveSpec };
export type HeldoutRoutingCase = HeldoutCase & { item: RoutingHeldoutItem; needs: readonly (readonly AgentOnDemandToolset[])[] };

export const HELDOUT_DOCS_CASES: readonly HeldoutDocsCase[] = DOCS_HELDOUT_LIVE_SPECS.map((spec) => ({
  id: spec.id as HeldoutCaseId,
  title: `Held-out docs ${spec.itemId} (${spec.lang}): ${spec.page}`,
  actor: "driver",
  prompts: [spec.prompt],
  contexts: [{ locale: spec.locale, pageRoute: `/${spec.locale}/contacts` }],
  judgeFacts: [spec.goldFact, `Documentation section: ${spec.page}`],
  comparative: true,
  judgeable: false,
  heldout: true,
  spec,
}));

export const HELDOUT_ROUTING_CASES: readonly HeldoutRoutingCase[] = ROUTING_HELDOUT.map((item, index) => ({
  id: `RH${String(index + 1).padStart(2, "0")}` as HeldoutCaseId,
  title: `Held-out routing ${item.id} (${item.set})`,
  actor: "driver",
  prompts: item.prompts,
  judgeFacts: [],
  comparative: true,
  judgeable: false,
  heldout: true,
  item,
  needs: item.perTurn ?? item.prompts.map(() => item.toolsets),
}));

export const HELDOUT_CASES: readonly HeldoutCase[] = [...HELDOUT_DOCS_CASES, ...HELDOUT_ROUTING_CASES].map(
  ({ id, title, actor, prompts, contexts, judgeFacts, comparative, judgeable, heldout }) => ({
    id,
    title,
    actor,
    prompts,
    ...(contexts ? { contexts } : {}),
    judgeFacts,
    comparative,
    judgeable,
    heldout,
  }),
);

const HELDOUT_IDS: ReadonlySet<string> = new Set(HELDOUT_CASES.map((definition) => definition.id));

export function isHeldoutCaseId(value: string): value is HeldoutCaseId {
  return HELDOUT_IDS.has(value);
}

export const isHeldoutDocsCaseId = (value: string) => HELDOUT_DOCS_CASES.some((definition) => definition.id === value);
export const isHeldoutRoutingCaseId = (value: string) =>
  HELDOUT_ROUTING_CASES.some((definition) => definition.id === value);

/** The on-demand sets a turn's tool calls used; `load_toolset` itself is not a use. */
export function toolsetsCalledInTurn(tools: readonly { name: string }[]): Set<AgentOnDemandToolset> {
  const used = new Set<AgentOnDemandToolset>();
  for (const tool of tools) {
    if (tool.name === LOAD_TOOLSET_TOOL_NAME) continue;
    const toolset = onDemandToolsetOfTool(tool.name);
    if (toolset) used.add(toolset);
  }
  return used;
}

export function scoreHeldoutCase(
  caseId: HeldoutCaseId,
  c: {
    turnTools: readonly (readonly { name: string }[])[];
    unchanged: boolean;
    noMutatingTools: boolean;
    check: (id: string, passed: boolean, gate?: "quality" | "runtime" | "safety") => void;
  },
): void {
  if (isHeldoutDocsCaseId(caseId)) {
    c.check("business-state-unchanged", c.unchanged, "safety");
    c.check("no-mutating-tool-attempt", c.noMutatingTools, "safety");
    return;
  }
  const definition = HELDOUT_ROUTING_CASES.find((entry) => entry.id === caseId);
  if (!definition) throw new Error(`Unknown held-out case ${caseId}`);
  definition.needs.forEach((needed, index) => {
    const used = toolsetsCalledInTurn(c.turnTools[index] ?? []);
    for (const toolset of needed) c.check(`turn-${index + 1}:uses-${toolset}`, used.has(toolset));
  });
}
