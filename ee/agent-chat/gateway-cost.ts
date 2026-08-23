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
  return decimalUsdToMicrocents(value) === 0;
}

function succeededProviderAttempts(routing: Record<string, unknown>) {
  const modelAttempts = Array.isArray(routing.modelAttempts) ? routing.modelAttempts : [];

  return modelAttempts
    .flatMap((modelAttempt) => {
      const attempts = record(modelAttempt)?.providerAttempts;
      return Array.isArray(attempts) ? attempts : [];
    })
    .flatMap((attempt) => {
      const parsed = record(attempt);
      return parsed && parsed.success === true ? [parsed] : [];
    });
}

export function readAgentProviderCharge(metadata: unknown, expectedProvider: string): AgentProviderChargeReading {
  const gateway = record(record(metadata)?.gateway);
  if (!gateway) return { outcome: "unreadable", reason: "the gateway reported no cost metadata" };
  if ("serviceTier" in gateway)
    return { outcome: "unreadable", reason: "the gateway reported an unpriced service tier" };

  const routing = record(gateway.routing);
  if (!routing) return { outcome: "unreadable", reason: "the gateway reported no routing metadata" };

  const attempts = succeededProviderAttempts(routing);
  if (attempts.length === 0) return { outcome: "notBilled" };

  if (attempts.some((attempt) => attempt.credentialType !== "system"))
    return { outcome: "unreadable", reason: "the model was served on a credential this platform does not bill" };

  const finalProvider = typeof routing.finalProvider === "string" ? routing.finalProvider : null;
  if (finalProvider !== expectedProvider || attempts.some((attempt) => attempt.provider !== expectedProvider))
    return { outcome: "unreadable", reason: `the model was served by a provider other than "${expectedProvider}"` };

  if (gateway.upstreamInferenceCost !== undefined && !isZeroDecimal(gateway.upstreamInferenceCost))
    return { outcome: "unreadable", reason: "the gateway reported an upstream cost this platform cannot attribute" };

  const costMicrocents = decimalUsdToMicrocents(gateway.inferenceCost ?? gateway.cost);
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

export function readAgentProviderChargeFromError(error: unknown, expectedProvider: string): AgentProviderChargeReading {
  const metadata = record(record(record(error)?.data)?.providerMetadata);
  if (!metadata) return { outcome: "unreadable", reason: "the failed provider call reported no gateway metadata" };

  return readAgentProviderCharge(metadata, expectedProvider);
}
