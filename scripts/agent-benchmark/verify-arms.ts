import type { BenchmarkArm } from "./arms";

import {
  OVH_AI_ENDPOINTS_ATTESTATION,
  OVH_AI_ENDPOINTS_MODELS_URL,
  OVH_SERVING_PROVIDER,
  ovhNativeModelId,
} from "@/ee/agent-chat/ovh-ai-endpoints-catalog";

export const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

export type ArmVerification = {
  arm: string;
  modelId: string;
  provider: string;
  eligible: boolean;
  hasZdr: boolean | null;
  hasNoTraining: boolean | null;
  reason: string | null;
  promptUsd: string | null;
  completionUsd: string | null;
  attestation?: string;
};

type GatewayEndpointListing = {
  data?: {
    endpoints?: {
      provider_name?: string;
      name?: string;
      has_zdr?: boolean;
      has_no_training?: boolean;
      pricing?: { prompt?: string; completion?: string };
    }[];
  };
};

type OvhCatalog = {
  data?: {
    id?: string;
    pricing?: { prompt?: unknown; completion?: unknown };
  }[];
};

function result(
  arm: BenchmarkArm,
  fields: Omit<ArmVerification, "arm" | "modelId" | "provider">,
): ArmVerification {
  return {
    arm: arm.id,
    modelId: arm.modelId,
    provider: arm.servingProvider,
    ...fields,
  };
}

async function verifyGatewayArm(
  arm: BenchmarkArm,
  fetcher: typeof fetch,
): Promise<ArmVerification> {
  const response = await fetcher(
    `${GATEWAY_MODELS_URL}/${arm.modelId}/endpoints`,
  );
  if (!response.ok)
    return result(arm, {
      eligible: false,
      hasZdr: null,
      hasNoTraining: null,
      reason: `gateway ${response.status}`,
      promptUsd: null,
      completionUsd: null,
    });
  const body = (await response.json()) as GatewayEndpointListing;
  const endpoint = body.data?.endpoints?.find(
    (candidate) =>
      (candidate.provider_name ?? candidate.name) === arm.servingProvider,
  );
  if (!endpoint)
    return result(arm, {
      eligible: false,
      hasZdr: null,
      hasNoTraining: null,
      reason: "provider no longer serves the model",
      promptUsd: null,
      completionUsd: null,
    });
  const eligible =
    endpoint.has_zdr === true && endpoint.has_no_training === true;
  return result(arm, {
    eligible,
    hasZdr: endpoint.has_zdr ?? null,
    hasNoTraining: endpoint.has_no_training ?? null,
    reason: eligible
      ? null
      : "endpoint reports no ZDR or no prompt-training opt-out",
    promptUsd: endpoint.pricing?.prompt ?? null,
    completionUsd: endpoint.pricing?.completion ?? null,
  });
}

// OVH is served directly, so the Gateway's per-endpoint ZDR and training flags
// do not exist for it. Eligibility rests on the recorded attestation of OVH's
// public statement and on the model still being in OVH's live public catalog.
function verifyOvhArm(
  arm: BenchmarkArm,
  catalog: OvhCatalog | string,
): ArmVerification {
  const attestation = OVH_AI_ENDPOINTS_ATTESTATION.source;
  const excluded = (reason: string) =>
    result(arm, {
      eligible: false,
      hasZdr: null,
      hasNoTraining: null,
      reason,
      promptUsd: null,
      completionUsd: null,
      attestation,
    });
  if (typeof catalog === "string") return excluded(catalog);

  let nativeModelId: string;
  try {
    nativeModelId = ovhNativeModelId(arm.modelId);
  } catch (error) {
    return excluded(
      error instanceof Error ? error.message : "not an OVH model id",
    );
  }
  if (arm.inferenceRegion !== OVH_AI_ENDPOINTS_ATTESTATION.inferenceRegion)
    return excluded(
      `OVH arms must declare inference region "${OVH_AI_ENDPOINTS_ATTESTATION.inferenceRegion}"`,
    );
  const model = catalog.data?.find(
    (candidate) => candidate.id === nativeModelId,
  );
  if (!model) return excluded("OVH catalog no longer lists the model");

  const hasZdr = OVH_AI_ENDPOINTS_ATTESTATION.zeroDataRetention;
  const hasNoTraining = OVH_AI_ENDPOINTS_ATTESTATION.noPromptTraining;
  const eligible = hasZdr && hasNoTraining;
  return result(arm, {
    eligible,
    hasZdr,
    hasNoTraining,
    reason: eligible
      ? null
      : "attestation reports no ZDR or no prompt-training opt-out",
    promptUsd:
      typeof model.pricing?.prompt === "string" ? model.pricing.prompt : null,
    completionUsd:
      typeof model.pricing?.completion === "string"
        ? model.pricing.completion
        : null,
    attestation,
  });
}

async function fetchOvhCatalog(
  fetcher: typeof fetch,
): Promise<OvhCatalog | string> {
  try {
    const response = await fetcher(OVH_AI_ENDPOINTS_MODELS_URL);
    if (!response.ok) return `OVH catalog ${response.status}`;
    return (await response.json()) as OvhCatalog;
  } catch {
    return "OVH catalog unreachable";
  }
}

export async function verifyArms(
  arms: readonly BenchmarkArm[],
  fetcher: typeof fetch = fetch,
): Promise<ArmVerification[]> {
  const results: ArmVerification[] = [];
  let ovhCatalog: OvhCatalog | string | undefined;
  for (const arm of arms) {
    if (arm.servingProvider === OVH_SERVING_PROVIDER) {
      ovhCatalog ??= await fetchOvhCatalog(fetcher);
      results.push(verifyOvhArm(arm, ovhCatalog));
      continue;
    }
    results.push(await verifyGatewayArm(arm, fetcher));
  }
  return results;
}
