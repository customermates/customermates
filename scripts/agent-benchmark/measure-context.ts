import { agentToolDefinitionsForToolsets, agentToolDefinitionsForTurn } from "@/ee/agent-chat/agent-tools";
import { buildAgentSystemPrompt } from "@/ee/agent-chat/system-prompt";
import { conservativeAgentInitialContextBytes } from "@/ee/agent-chat/agent-provider-context";
import { toolsetsForRequest } from "@/ee/agent-chat/agent-toolset-routing";
import { MODEL_CATALOG, resolveAgentModel, SHIPPED_AGENT_MODEL_KEY } from "@/ee/agent-chat/model-catalog";
import { agentRoundWorstCaseCredits, resolveAgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";

const bytes = (value: unknown) =>
  new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;

export type ContextMeasurement = {
  question: string;
  pageRoute: string | null;
  toolsets: string[];
  fullCatalogTools: number;
  fullCatalogBytes: number;
  routedTools: number;
  routedBytes: number;
  systemPromptBytes: { current: number; v2: number };
  conservativeInitialBytes: { current: number | null; v2: number | null };
  perTool: { name: string; bytes: number }[];
};

export function measureAgentContext(question: string, pageRoute: string | null): ContextMeasurement {
  const model = resolveAgentModel(SHIPPED_AGENT_MODEL_KEY);
  const definitions = agentToolDefinitionsForTurn({ servingProvider: model.servingProvider, surface: "chat" });
  const toolsets = [...toolsetsForRequest({ text: question, pageRoute })];
  const routed = agentToolDefinitionsForToolsets(definitions, toolsets);
  const promptCurrent = buildAgentSystemPrompt({
    userName: "Benjamin Wagner",
    appBaseUrl: "https://customermates.com",
    locale: "en",
    surface: "chat",
  });
  const promptV2 = buildAgentSystemPrompt({
    userName: "Benjamin Wagner",
    appBaseUrl: "https://customermates.com",
    locale: "en",
    surface: "chat",
    toolsetRouting: true,
    promptV2: true,
  });
  const strip = (items: typeof definitions) =>
    items.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  return {
    question,
    pageRoute,
    toolsets,
    fullCatalogTools: definitions.length,
    fullCatalogBytes: bytes(strip(definitions)),
    routedTools: routed.length,
    routedBytes: bytes(strip(routed)),
    systemPromptBytes: { current: bytes(promptCurrent), v2: bytes(promptV2) },
    conservativeInitialBytes: {
      current: conservativeAgentInitialContextBytes({
        systemPrompt: promptCurrent,
        currentText: question,
        pageRoute,
        toolDefinitions: strip(definitions),
      }),
      v2: conservativeAgentInitialContextBytes({
        systemPrompt: promptV2,
        currentText: question,
        pageRoute,
        toolDefinitions: strip(routed),
      }),
    },
    perTool: definitions
      .map((definition) => ({ name: definition.name, bytes: bytes({ d: definition.description, s: definition.inputSchema }) }))
      .toSorted((a, b) => b.bytes - a.bytes),
  };
}

export function reservationSummary() {
  return Object.entries(MODEL_CATALOG).map(([key, entry]) => {
    const budget = resolveAgentTurnBudget({ model: entry, availableCredits: 500 });
    return {
      key,
      modelId: entry.modelId,
      roundReserveCredits: agentRoundWorstCaseCredits(entry),
      reservedCreditsAt500: budget?.reservedCredits ?? null,
      maxContextBytes: budget?.maxContextBytes ?? null,
    };
  });
}

if (process.argv[1]?.endsWith("measure-context.ts")) {
  const questions: [string, string | null][] = [
    ["How many open deals do we have and what is their weighted value?", "/en/deals"],
    ["Reply to the last email from ACME with a short thank-you note.", "/en/inbox"],
    ["Create a routine that reminds me every Monday about stale deals.", "/en/dashboard"],
  ];
  const report = {
    reservations: reservationSummary(),
    measurements: questions.map(([question, route]) => {
      const { perTool, ...rest } = measureAgentContext(question, route);
      return { ...rest, largestTools: perTool.slice(0, 8) };
    }),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
