import { resolveModelPricing } from "./model-pricing";

export const AGENT_MAX_STEPS_PER_TURN = 8;
export const AGENT_MAX_OUTPUT_TOKENS_PER_STEP = 2048;
export const AGENT_MIN_OUTPUT_TOKENS_PER_STEP = 256;
export const AGENT_MAX_TOOL_RESULT_CHARS = 6000;
export const AGENT_MAX_CONTEXT_BYTES_PER_STEP = 200_000;
export const AGENT_MIN_CONTEXT_BYTES_PER_STEP = 24_000;
export const AGENT_MIN_TOOL_RESULT_CHARS = 512;

const AGENT_PROVIDER_TOKENIZATION_AND_FRAMING_OVERHEAD_PER_STEP = 10_000;
const AGENT_INTERSTEP_FRAMING_BYTES = 1_024;
const AGENT_OUTPUT_CONTEXT_BYTES_PER_TOKEN = 4;
const AGENT_TOOL_RESULT_CONTEXT_BYTES_PER_CHAR = 4;
const SAFE_AGENT_MODEL_SPEC = "openai:gpt-5.6-luna";
const SAFE_MODEL_PRICING = resolveModelPricing("gpt-5.6-luna");
const USD_PER_AGENT_CREDIT = 0.01;

export type AgentTurnBudget = {
  reservedCredits: number;
  maxSteps: number;
  maxOutputTokens: number;
  maxContextBytes: number;
  maxToolResultChars: number;
};

function modelId(modelSpec: string) {
  const separator = modelSpec.indexOf(":");
  return separator === -1 ? modelSpec : modelSpec.slice(separator + 1);
}

export function isAgentModelWithinBudgetEnvelope(modelSpec: string) {
  if (modelSpec !== SAFE_AGENT_MODEL_SPEC) return false;

  const resolvedModelId = modelId(modelSpec);
  const pricing = resolveModelPricing(resolvedModelId);
  return (
    pricing.inputPerMTok <= SAFE_MODEL_PRICING.inputPerMTok &&
    pricing.outputPerMTok <= SAFE_MODEL_PRICING.outputPerMTok &&
    pricing.cacheReadPerMTok <= SAFE_MODEL_PRICING.cacheReadPerMTok &&
    pricing.cacheWritePerMTok <= SAFE_MODEL_PRICING.cacheWritePerMTok
  );
}

function stepWorstCaseUsd(modelSpec: string, contextBytes: number, outputTokens: number) {
  const pricing = resolveModelPricing(modelId(modelSpec));
  const maxInputRate = Math.max(pricing.inputPerMTok, pricing.cacheReadPerMTok, pricing.cacheWritePerMTok);

  return (
    ((contextBytes + AGENT_PROVIDER_TOKENIZATION_AND_FRAMING_OVERHEAD_PER_STEP) * maxInputRate) / 1_000_000 +
    (outputTokens * pricing.outputPerMTok) / 1_000_000
  );
}

export function agentTurnWorstCaseUsd(
  modelSpec: string,
  budget: Pick<AgentTurnBudget, "maxSteps" | "maxOutputTokens" | "maxContextBytes"> = {
    maxSteps: AGENT_MAX_STEPS_PER_TURN,
    maxOutputTokens: AGENT_MAX_OUTPUT_TOKENS_PER_STEP,
    maxContextBytes: AGENT_MAX_CONTEXT_BYTES_PER_STEP,
  },
) {
  return budget.maxSteps * stepWorstCaseUsd(modelSpec, budget.maxContextBytes, budget.maxOutputTokens);
}

export function resolveAgentTurnBudget(args: {
  availableCredits: number;
  requiredContextBytes?: number;
}): AgentTurnBudget | null {
  if (!Number.isSafeInteger(args.availableCredits) || args.availableCredits < 1) return null;
  if (!isAgentModelWithinBudgetEnvelope(SAFE_AGENT_MODEL_SPEC)) return null;

  const requiredContextBytes = args.requiredContextBytes ?? AGENT_MIN_CONTEXT_BYTES_PER_STEP;
  if (
    !Number.isSafeInteger(requiredContextBytes) ||
    requiredContextBytes < 1 ||
    requiredContextBytes > AGENT_MAX_CONTEXT_BYTES_PER_STEP
  )
    return null;

  const configuredSteps = AGENT_MAX_STEPS_PER_TURN;
  const configuredOutput = AGENT_MAX_OUTPUT_TOKENS_PER_STEP;
  const configuredToolResultChars = AGENT_MAX_TOOL_RESULT_CHARS;
  const fullTurnCredits = Math.max(
    1,
    Math.ceil(
      agentTurnWorstCaseUsd(SAFE_AGENT_MODEL_SPEC, {
        maxSteps: configuredSteps,
        maxOutputTokens: configuredOutput,
        maxContextBytes: AGENT_MAX_CONTEXT_BYTES_PER_STEP,
      }) / USD_PER_AGENT_CREDIT,
    ),
  );
  const reservedCredits = Math.min(args.availableCredits, fullTurnCredits);
  const turnBudgetUsd = reservedCredits * USD_PER_AGENT_CREDIT;
  const pricing = resolveModelPricing(modelId(SAFE_AGENT_MODEL_SPEC));
  const maxInputRate = Math.max(pricing.inputPerMTok, pricing.cacheReadPerMTok, pricing.cacheWritePerMTok);

  for (let maxSteps = configuredSteps; maxSteps >= 1; maxSteps -= 1) {
    const stepBudgetUsd = turnBudgetUsd / maxSteps;
    const minimumContextBytes = Math.max(AGENT_MIN_CONTEXT_BYTES_PER_STEP, requiredContextBytes);
    const minimumInputCost =
      ((minimumContextBytes + AGENT_PROVIDER_TOKENIZATION_AND_FRAMING_OVERHEAD_PER_STEP) * maxInputRate) / 1_000_000;
    const maximumAffordableOutput = Math.floor(
      ((stepBudgetUsd - minimumInputCost) * 1_000_000) / pricing.outputPerMTok,
    );
    const minimumOutputTokens = Math.min(configuredOutput, AGENT_MIN_OUTPUT_TOKENS_PER_STEP);

    for (
      let maxOutputTokens = Math.min(configuredOutput, maximumAffordableOutput);
      maxOutputTokens >= minimumOutputTokens;
      maxOutputTokens -= 1
    ) {
      const outputCost = (maxOutputTokens * pricing.outputPerMTok) / 1_000_000;
      const maxContextBytes = Math.min(
        AGENT_MAX_CONTEXT_BYTES_PER_STEP,
        Math.floor(((stepBudgetUsd - outputCost) * 1_000_000) / maxInputRate) -
          AGENT_PROVIDER_TOKENIZATION_AND_FRAMING_OVERHEAD_PER_STEP,
      );
      if (maxContextBytes < minimumContextBytes) continue;

      let maxToolResultChars = configuredToolResultChars;
      if (maxSteps > 1) {
        const availableGrowthBytesPerStep = Math.floor((maxContextBytes - requiredContextBytes) / (maxSteps - 1));
        const outputAndFramingBytes =
          maxOutputTokens * AGENT_OUTPUT_CONTEXT_BYTES_PER_TOKEN + AGENT_INTERSTEP_FRAMING_BYTES;
        maxToolResultChars = Math.min(
          configuredToolResultChars,
          Math.floor((availableGrowthBytesPerStep - outputAndFramingBytes) / AGENT_TOOL_RESULT_CONTEXT_BYTES_PER_CHAR),
        );
        if (maxToolResultChars < AGENT_MIN_TOOL_RESULT_CHARS) continue;
      }

      const budget = {
        reservedCredits,
        maxSteps,
        maxOutputTokens,
        maxContextBytes,
        maxToolResultChars,
      };
      if (agentTurnWorstCaseUsd(SAFE_AGENT_MODEL_SPEC, budget) <= turnBudgetUsd) return budget;
    }
  }

  return null;
}

export function serializedAgentContextBytes(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

export function isAgentContextWithinBudget(value: unknown, maxContextBytes = AGENT_MAX_CONTEXT_BYTES_PER_STEP) {
  if (!Number.isSafeInteger(maxContextBytes) || maxContextBytes < 1) return false;
  const bytes = serializedAgentContextBytes(value);
  return bytes !== null && bytes <= maxContextBytes;
}

export function resolveAgentToolResultMaxChars(configured: number) {
  if (!Number.isFinite(configured) || configured <= 0) return 1;
  return Math.min(Math.floor(configured), AGENT_MAX_TOOL_RESULT_CHARS);
}
