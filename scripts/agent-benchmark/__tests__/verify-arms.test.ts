import { describe, expect, it, vi } from "vitest";

import { armById } from "../arms";
import { verifyArms } from "../verify-arms";

const OVH_CATALOG = {
  object: "list",
  data: [
    {
      id: "Qwen3.8-27B",
      pricing: {
        currency_unit: "USD",
        prompt: "0.00000047",
        completion: "0.00000319",
      },
    },
    {
      id: "gpt-oss-120b",
      pricing: {
        currency_unit: "USD",
        prompt: "0.00000009",
        completion: "0.00000047",
      },
    },
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("verify-arms", () => {
  it("verifies OVH arms against the live OVH catalog and the recorded attestation, never the Gateway", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(json(OVH_CATALOG)),
    );

    const results = await verifyArms(
      [
        armById("ovh-qwen38-27b"),
        armById("ovh-gpt-oss-120b-low"),
        armById("ovh-mistral-small-32"),
      ],
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models",
    );
    expect(results[0]).toEqual({
      arm: "ovh-qwen38-27b",
      modelId: "ovh/Qwen3.8-27B",
      provider: "ovh",
      eligible: true,
      hasZdr: true,
      hasNoTraining: true,
      reason: null,
      promptUsd: "0.00000047",
      completionUsd: "0.00000319",
      attestation: "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/",
    });
    expect(results[1]).toMatchObject({
      arm: "ovh-gpt-oss-120b-low",
      eligible: true,
    });
    expect(results[2]).toMatchObject({
      arm: "ovh-mistral-small-32",
      eligible: false,
      reason: "OVH catalog no longer lists the model",
    });
  });

  it("excludes OVH arms when the OVH catalog cannot be read", async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(json({}, 503)));
    const [result] = await verifyArms([armById("ovh-qwen38-27b")], fetcher);
    expect(result).toMatchObject({
      eligible: false,
      reason: "OVH catalog 503",
      hasZdr: null,
    });
  });

  it("keeps Gateway arms on the Gateway endpoint listing", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        json({
          data: {
            endpoints: [
              {
                provider_name: "vertex",
                has_zdr: true,
                has_no_training: true,
                pricing: { prompt: "1", completion: "2" },
              },
            ],
          },
        }),
      ),
    );
    const [result] = await verifyArms([armById("flash-low")], fetcher);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://ai-gateway.vercel.sh/v1/models/google/gemini-3.5-flash/endpoints",
    );
    expect(result).toMatchObject({
      arm: "flash-low",
      eligible: true,
      hasZdr: true,
      hasNoTraining: true,
    });
  });
});
