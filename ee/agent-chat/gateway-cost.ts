import { agentServingProviderUsesGateway } from "./ovh-ai-endpoints-catalog";

const MICROCENT_DECIMALS = 8;

export type AgentProviderCharge = {
  costMicrocents: number;
  finalProvider: string;
  generationId: string | null;
};

export type AgentProviderChargeReading =
  | { outcome: "measured"; charge: AgentProviderCharge }
  | { outcome: "notBilled" }
  | { outcome: "unreadable"; reason: string };

export type AgentServedChargeReading = AgentProviderChargeReading | { outcome: "tokenPriced" };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function decimalUsdToMicrocents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) return null;

  const [whole, fraction = ""] = value.split(".");
  const kept = fraction.slice(0, MICROCENT_DECIMALS).padEnd(MICROCENT_DECIMALS, "0");
  const roundUp = Number(fraction.charAt(MICROCENT_DECIMALS) || "0") >= 5;
  const microcents = Number(`${whole}${kept}`) + (roundUp ? 1 : 0);

  return Number.isSafeInteger(microcents) ? microcents : null;
}

function isZeroDecimal(value: unknown) {
  return typeof value === "string" && /^0+(\.0+)?$/.test(value);
}

function succeededProviderAttempts(routing: Record<string, unknown>): Record<string, unknown>[] | null {
  if (!Array.isArray(routing.modelAttempts)) return null;

  const succeeded: Record<string, unknown>[] = [];
  for (const modelAttempt of routing.modelAttempts) {
    const model = record(modelAttempt);
    if (!model || !Array.isArray(model.providerAttempts)) return null;

    for (const attempt of model.providerAttempts) {
      const parsed = record(attempt);
      if (!parsed || typeof parsed.success !== "boolean") return null;
      if (parsed.success) succeeded.push(parsed);
    }
  }
  return succeeded;
}

export function readGatewayCostMicrocents(metadata: unknown): number | null {
  return decimalUsdToMicrocents(record(record(metadata)?.gateway)?.gatewayCost);
}

export function readAgentProviderCharge(metadata: unknown, expectedProvider: string): AgentProviderChargeReading {
  const gateway = record(record(metadata)?.gateway);
  if (!gateway) return { outcome: "unreadable", reason: "the gateway reported no cost metadata" };
  if ("serviceTier" in gateway)
    return { outcome: "unreadable", reason: "the gateway reported an unpriced service tier" };

  const routing = record(gateway.routing);
  if (!routing) return { outcome: "unreadable", reason: "the gateway reported no routing metadata" };

  const attempts = succeededProviderAttempts(routing);
  if (attempts === null)
    return { outcome: "unreadable", reason: "the gateway reported incomplete serving-attempt metadata" };
  if (attempts.length === 0) {
    const hasUnattributedCharge = ["gatewayCost", "cost", "surchargeCost", "upstreamInferenceCost"].some(
      (field) => field in gateway && !isZeroDecimal(gateway[field]),
    );
    return hasUnattributedCharge
      ? { outcome: "unreadable", reason: "the gateway reported a charge without a successful serving attempt" }
      : { outcome: "notBilled" };
  }

  if (attempts.some((attempt) => attempt.credentialType !== "system"))
    return { outcome: "unreadable", reason: "the model was served on a credential this platform does not bill" };

  const finalProvider = typeof routing.finalProvider === "string" ? routing.finalProvider : null;
  if (finalProvider !== expectedProvider || attempts.some((attempt) => attempt.provider !== expectedProvider))
    return { outcome: "unreadable", reason: `the model was served by a provider other than "${expectedProvider}"` };

  if (gateway.upstreamInferenceCost !== undefined && !isZeroDecimal(gateway.upstreamInferenceCost))
    return { outcome: "unreadable", reason: "the gateway reported an upstream cost this platform cannot attribute" };

  const hasGatewayCost = "gatewayCost" in gateway;
  if (!hasGatewayCost && !isZeroDecimal(gateway.surchargeCost))
    return { outcome: "unreadable", reason: "the gateway reported no authoritative total cost" };
  const costMicrocents = decimalUsdToMicrocents(hasGatewayCost ? gateway.gatewayCost : gateway.cost);
  if (costMicrocents === null) return { outcome: "unreadable", reason: "the gateway reported no usable cost figure" };

  return {
    outcome: "measured",
    charge: {
      costMicrocents,
      finalProvider,
      generationId: typeof gateway.generationId === "string" ? gateway.generationId : null,
    },
  };
}

export function readAgentServedCharge(metadata: unknown, servingProvider: string): AgentServedChargeReading {
  if (agentServingProviderUsesGateway(servingProvider)) return readAgentProviderCharge(metadata, servingProvider);
  if (record(record(metadata)?.gateway)) {
    return {
      outcome: "unreadable",
      reason: `the gateway reported a receipt for "${servingProvider}", which is served without the gateway`,
    };
  }
  return { outcome: "tokenPriced" };
}
