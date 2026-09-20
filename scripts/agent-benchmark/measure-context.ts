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
  systemPromptBytes: number;
  conservativeInitialBytes: { fullCatalog: number | null; routed: number | null };
  perTool: { name: string; bytes: number }[];
  routedPerTool: { name: string; bytes: number }[];
};

export function measureAgentContext(question: string, pageRoute: string | null): ContextMeasurement {
  const model = resolveAgentModel(SHIPPED_AGENT_MODEL_KEY);
  const definitions = agentToolDefinitionsForTurn({ servingProvider: model.servingProvider, surface: "chat" });
  const toolsets = [...toolsetsForRequest({ text: question, pageRoute })];
  const routed = agentToolDefinitionsForToolsets(definitions, toolsets);
  const systemPrompt = buildAgentSystemPrompt({
    userName: "Benjamin Wagner",
    appBaseUrl: "https://customermates.com",
    locale: "en",
    surface: "chat",
  });
  const strip = (items: typeof definitions) =>
    items.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  const perToolBytes = (items: typeof definitions) =>
    items
      .map((definition) => ({
        name: definition.name,
        bytes: bytes({ d: definition.description, s: definition.inputSchema }),
      }))
      .toSorted((a, b) => b.bytes - a.bytes);
  return {
    question,
    pageRoute,
    toolsets,
    fullCatalogTools: definitions.length,
    fullCatalogBytes: bytes(strip(definitions)),
    routedTools: routed.length,
    routedBytes: bytes(strip(routed)),
    systemPromptBytes: bytes(systemPrompt),
    conservativeInitialBytes: {
      fullCatalog: conservativeAgentInitialContextBytes({
        systemPrompt,
        currentText: question,
        pageRoute,
        toolDefinitions: strip(definitions),
      }),
      routed: conservativeAgentInitialContextBytes({
        systemPrompt,
        currentText: question,
        pageRoute,
        toolDefinitions: strip(routed),
      }),
    },
    perTool: perToolBytes(definitions),
    routedPerTool: perToolBytes(routed),
  };
}

export function admissionFloorCredits(entry: (typeof MODEL_CATALOG)[keyof typeof MODEL_CATALOG], initialContextBytes: number) {
  for (let credits = 1; credits <= agentRoundWorstCaseCredits(entry); credits += 1) {
    const budget = resolveAgentTurnBudget({
      model: entry,
      availableCredits: credits,
      requiredContextBytes: initialContextBytes,
    });
    if (budget) return credits;
  }
  return null;
}

export function reservationSummary(initialContextBytes?: number) {
  return Object.entries(MODEL_CATALOG).map(([key, entry]) => {
    const budget = resolveAgentTurnBudget({
      model: entry,
      availableCredits: 500,
      ...(initialContextBytes === undefined ? {} : { requiredContextBytes: initialContextBytes }),
    });
    return {
      key,
      modelId: entry.modelId,
      roundReserveCredits: agentRoundWorstCaseCredits(entry),
      admissionFloorCredits: initialContextBytes === undefined ? null : admissionFloorCredits(entry, initialContextBytes),
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
  const measured = measureAgentContext(questions[0]![0], questions[0]![1]);
  const report = {
    reservations: reservationSummary(measured.conservativeInitialBytes.fullCatalog ?? undefined),
    measurements: questions.map(([question, route]) => {
      const { perTool, routedPerTool, ...rest } = measureAgentContext(question, route);
      return { ...rest, largestTools: perTool.slice(0, 8), largestRoutedTools: routedPerTool.slice(0, 12) };
    }),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
