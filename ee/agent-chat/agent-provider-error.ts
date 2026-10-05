import { readAgentProviderCharge, readGatewayCostMicrocents } from "./gateway-cost";
import { agentServingProviderUsesGateway } from "./ovh-ai-endpoints-catalog";

export type AgentProviderErrorCharge = {
  costMicrocents: number;
  measured: boolean;
  unreadableReason?: string;
  providerFailure?: boolean;
};

export type AgentProviderRoundCharge = AgentProviderErrorCharge & {
  currentAttemptOutcome: "measured" | "notBilled" | "unreadable";
};

type ProviderReceipt = {
  outcome: "measured" | "notBilled" | "unreadable";
  costMicrocents: number;
  generationId: string | null;
  unreadableReason?: string;
};

function gatewayFailureRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedGatewayFailureMetadata(value: unknown): Record<string, unknown> | null {
  const gateway = gatewayFailureRecord(gatewayFailureRecord(value)?.gateway);
  if (!gateway) return null;
  const projected: Record<string, unknown> = {};
  for (const field of ["gatewayCost", "cost", "surchargeCost", "upstreamInferenceCost"] as const) {
    if (field in gateway) {
      projected[field] =
        typeof gateway[field] === "string" && gateway[field].length <= 96 && /^\d+(\.\d+)?$/.test(gateway[field])
          ? gateway[field]
          : null;
    }
  }
  if ("serviceTier" in gateway) projected.serviceTier = true;
  if (typeof gateway.generationId === "string" && gateway.generationId.length > 0 && gateway.generationId.length <= 128)
    projected.generationId = gateway.generationId;
  const routing = gatewayFailureRecord(gateway.routing);
  if (routing) {
    const modelAttempts = routing.modelAttempts;
    projected.routing = {
      finalProvider:
        typeof routing.finalProvider === "string" && routing.finalProvider.length <= 64 ? routing.finalProvider : null,
      modelAttempts:
        Array.isArray(modelAttempts) && modelAttempts.length <= 16
          ? modelAttempts.map((modelAttempt) => {
              const model = gatewayFailureRecord(modelAttempt);
              const attempts = model?.providerAttempts;
              return {
                providerAttempts:
                  Array.isArray(attempts) && attempts.length <= 16
                    ? attempts.map((attempt) => {
                        const parsed = gatewayFailureRecord(attempt);
                        return {
                          success: typeof parsed?.success === "boolean" ? parsed.success : null,
                          provider:
                            typeof parsed?.provider === "string" && parsed.provider.length <= 64
                              ? parsed.provider
                              : null,
                          credentialType:
                            typeof parsed?.credentialType === "string" && parsed.credentialType.length <= 64
                              ? parsed.credentialType
                              : null,
                        };
                      })
                    : null,
              };
            })
          : null,
    };
  }
  const metadata = { gateway: projected };
  return JSON.stringify(metadata).length <= 16_384 ? metadata : null;
}

function providerReceipt(value: unknown, expectedProvider: string): ProviderReceipt {
  const metadata = boundedGatewayFailureMetadata(value);
  const charge = readAgentProviderCharge(metadata, expectedProvider);
  const gateway = gatewayFailureRecord(metadata?.gateway);
  return {
    outcome: charge.outcome,
    costMicrocents:
      charge.outcome === "measured" ? charge.charge.costMicrocents : (readGatewayCostMicrocents(metadata) ?? 0),
    generationId: typeof gateway?.generationId === "string" ? gateway.generationId : null,
    ...(charge.outcome === "unreadable" ? { unreadableReason: charge.reason } : {}),
  };
}

function unreadableProviderReceipt(reason: string): ProviderReceipt {
  return { outcome: "unreadable", costMicrocents: 0, generationId: null, unreadableReason: reason };
}

function currentProviderReceipt(value: unknown, expectedProvider: string): ProviderReceipt {
  const current = gatewayFailureRecord(value);
  if (!current) return unreadableProviderReceipt("the current provider attempt was unavailable");
  const finish = "finishMetadata" in current ? providerReceipt(current.finishMetadata, expectedProvider) : null;
  if (finish && finish.outcome !== "unreadable") return finish;
  const attempts = current.errorAttempts;
  const validAttempts = Array.isArray(attempts) && attempts.length > 0 && attempts.length <= 16;
  const receipts = validAttempts ? attempts.map((attempt) => providerReceipt(attempt, expectedProvider)) : [];
  if (finish) receipts.unshift(finish);
  if (receipts.length === 0) return unreadableProviderReceipt("the current provider attempt reported no receipt");
  const largest = receipts.reduce((result, receipt) =>
    receipt.costMicrocents > result.costMicrocents ? receipt : result,
  );
  const consistent =
    !finish &&
    receipts.every((receipt) => receipt.outcome !== "unreadable") &&
    (receipts.length === 1 ||
      receipts.every((receipt) => receipt.outcome === "notBilled" && receipt.costMicrocents === 0) ||
      (largest.generationId !== null &&
        receipts.every(
          (receipt) =>
            receipt.generationId === largest.generationId &&
            receipt.outcome === largest.outcome &&
            receipt.costMicrocents === largest.costMicrocents,
        )));
  if (consistent) return largest;
  return {
    ...largest,
    outcome: "unreadable",
    unreadableReason:
      finish?.unreadableReason ??
      receipts.find((receipt) => receipt.unreadableReason)?.unreadableReason ??
      "the provider reported ambiguous receipts for the current request",
  };
}

function isDispatchRejectionWithoutReceipt(envelope: Record<string, unknown>) {
  const attempts = envelope.attempts;
  if (!Array.isArray(attempts)) return false;
  if (!("currentAttempt" in envelope))
    return attempts.length > 0 && attempts.length <= 16 && attempts.every((attempt) => attempt === null);
  const current = gatewayFailureRecord(envelope.currentAttempt);
  const errorAttempts = current?.errorAttempts;
  return (
    attempts.length === 0 &&
    current !== null &&
    !("finishMetadata" in current) &&
    Array.isArray(errorAttempts) &&
    errorAttempts.length === 1 &&
    errorAttempts[0] === null
  );
}

const UNAVAILABLE_BEFORE_STREAM_STATUSES = new Set([502, 503, 504]);

function isSingleDispatchWithoutReceipt(envelope: Record<string, unknown>) {
  const attempts = envelope.attempts;
  return !("currentAttempt" in envelope) && Array.isArray(attempts) && attempts.length === 1 && attempts[0] === null;
}

function rejectedBeforeGenerationWithoutGateway(envelope: Record<string, unknown>, expectedProvider: string) {
  if (agentServingProviderUsesGateway(expectedProvider)) return false;
  const status = envelope.statusCode;
  if (typeof status !== "number") return false;
  if (envelope.providerFailure === false || envelope.incompleteAttempts === true) return false;
  if (UNAVAILABLE_BEFORE_STREAM_STATUSES.has(status)) return isSingleDispatchWithoutReceipt(envelope);
  if (status < 400 || status >= 500 || status === 408) return false;
  return isDispatchRejectionWithoutReceipt(envelope);
}

function readProviderReceiptEnvelope(
  envelope: Record<string, unknown>,
  expectedProvider: string,
): AgentProviderRoundCharge {
  if (rejectedBeforeGenerationWithoutGateway(envelope, expectedProvider))
    return { costMicrocents: 0, measured: true, currentAttemptOutcome: "notBilled" };
  const attempts = envelope.attempts;
  const extended = "currentAttempt" in envelope;
  const validAttempts =
    Array.isArray(attempts) && attempts.length <= (extended ? 15 : 16) && (extended || attempts.length > 0);
  const receipts = validAttempts ? attempts.map((attempt) => providerReceipt(attempt, expectedProvider)) : [];
  const current = extended
    ? currentProviderReceipt(envelope.currentAttempt, expectedProvider)
    : (receipts.at(-1) ?? unreadableProviderReceipt("provider failure attempts were unavailable"));
  if (extended) receipts.push(current);
  let unreadableReason = !validAttempts
    ? "provider failure attempts were unavailable"
    : envelope.incompleteAttempts === true
      ? "some attempted provider requests reported no complete receipt"
      : undefined;
  if (
    ("incompleteAttempts" in envelope && typeof envelope.incompleteAttempts !== "boolean") ||
    ("providerFailure" in envelope && typeof envelope.providerFailure !== "boolean")
  )
    unreadableReason ??= "the provider receipt envelope reported invalid accounting flags";
  const generations = new Map<string, { outcome: string; costMicrocents: number }>();
  let costMicrocents = 0;
  for (const receipt of receipts) {
    if (receipt.outcome === "unreadable") unreadableReason ??= receipt.unreadableReason;
    const previous = receipt.generationId === null ? undefined : generations.get(receipt.generationId);
    if (previous) {
      if (previous.outcome !== receipt.outcome || previous.costMicrocents !== receipt.costMicrocents)
        unreadableReason ??= "the provider reported contradictory receipts for one generation";
      const delta = Math.max(0, receipt.costMicrocents - previous.costMicrocents);
      if (!Number.isSafeInteger(costMicrocents + delta))
        unreadableReason ??= "the provider reported an unrepresentable aggregate cost";
      costMicrocents = Math.min(Number.MAX_SAFE_INTEGER, costMicrocents + delta);
      previous.costMicrocents = Math.max(previous.costMicrocents, receipt.costMicrocents);
      continue;
    }
    if (!Number.isSafeInteger(costMicrocents + receipt.costMicrocents))
      unreadableReason ??= "the provider reported an unrepresentable aggregate cost";
    costMicrocents = Math.min(Number.MAX_SAFE_INTEGER, costMicrocents + receipt.costMicrocents);
    if (receipt.generationId !== null)
      generations.set(receipt.generationId, { outcome: receipt.outcome, costMicrocents: receipt.costMicrocents });
  }
  return {
    costMicrocents,
    measured: unreadableReason === undefined,
    currentAttemptOutcome: current.outcome,
    ...(unreadableReason ? { unreadableReason } : {}),
    ...(envelope.providerFailure === false ? { providerFailure: false } : {}),
  };
}

function providerFailureEnvelope(error: unknown): Record<string, unknown> | null {
  const seen = new Set<unknown>();
  let current = gatewayFailureRecord(error);
  for (let depth = 0; depth < 8 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    const cause = gatewayFailureRecord(current.cause);
    if (cause?.kind === "ai-sdk-workflow-provider-error" && cause.version === 1) return cause;
    current = cause;
  }
  return null;
}

export function readAgentProviderErrorCharge(
  error: unknown,
  expectedProvider: string,
): AgentProviderErrorCharge | null {
  const cause = providerFailureEnvelope(error);
  if (!cause) return null;
  const charge = readProviderReceiptEnvelope(cause, expectedProvider);
  return {
    costMicrocents: charge.costMicrocents,
    measured: charge.measured,
    ...(charge.unreadableReason ? { unreadableReason: charge.unreadableReason } : {}),
    ...(charge.providerFailure === false ? { providerFailure: false } : {}),
  };
}

export function readAgentProviderRoundCharge(
  metadata: unknown,
  expectedProvider: string,
): AgentProviderRoundCharge | null {
  const workflow = gatewayFailureRecord(gatewayFailureRecord(metadata)?.workflow);
  const envelope = gatewayFailureRecord(workflow?.providerReceipt);
  if (envelope?.kind !== "ai-sdk-workflow-provider-error" || envelope.version !== 1) return null;
  return readProviderReceiptEnvelope(envelope, expectedProvider);
}

export type AgentProviderRetryableRejection = { statusCode: number; retryAfterMs: number | null };

export function readAgentProviderRetryableRejection(
  error: unknown,
  expectedProvider: string,
): AgentProviderRetryableRejection | null {
  if (agentServingProviderUsesGateway(expectedProvider)) return null;
  const envelope = providerFailureEnvelope(error);
  const statusCode = envelope?.statusCode;
  if (!envelope || typeof statusCode !== "number") return null;
  if (statusCode !== 429 && !UNAVAILABLE_BEFORE_STREAM_STATUSES.has(statusCode)) return null;
  if (envelope.providerFailure === false || envelope.incompleteAttempts === true) return null;
  if (!isSingleDispatchWithoutReceipt(envelope)) return null;
  const retryAfterMs = envelope.retryAfterMs;
  return {
    statusCode,
    retryAfterMs:
      typeof retryAfterMs === "number" && Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0 ? retryAfterMs : null,
  };
}
