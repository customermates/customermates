import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const structured = vi.hoisted(() => ({
  generate: vi.fn(),
  worstCase: vi.fn().mockReturnValue(5_000),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/ee/agent-chat/structured-model-call", () => ({
  generateStructuredObject: structured.generate,
  structuredCallWorstCaseMicrocents: structured.worstCase,
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { AGENT_MODELS } from "@/ee/agent-chat/model-catalog";
import { HostedComposeModelCaller } from "../hosted-compose-model-caller";

const user = createMockUser({
  id: "00000000-0000-4000-8000-000000000010",
  companyId: "00000000-0000-4000-8000-000000000011",
});
const NOW = new Date("2026-11-17T08:00:00.000Z");
const GRANT = { purpose: "automationCompose", companyId: user.companyId, userId: user.id };
const RESERVATION = { id: "reservation-1", grant: GRANT, reservedMicrocents: 5_000, reservedAt: NOW };
const CALL = { system: "system", prompt: "prompt", schema: z.object({ status: z.string() }) };

function usage(options: { grant?: boolean; reserved?: boolean; blockedReason?: string | null } = {}) {
  return {
    prepareRetrieval: vi.fn().mockResolvedValue(options.grant === false ? null : GRANT),
    reserveRetrieval: vi.fn().mockResolvedValue(options.reserved === false ? null : RESERVATION),
    settleRetrieval: vi.fn().mockResolvedValue(undefined),
    getUsageSummary: vi.fn().mockResolvedValue({ blockedReason: options.blockedReason ?? null }),
  };
}

const asUser = <T>(fn: () => Promise<T>) => runWithTenant(user, fn);

describe("HostedComposeModelCaller", () => {
  beforeEach(() => {
    structured.generate.mockClear();
  });

  it("reserves the member's Mate credits for the compose purpose, calls the model and settles the measured charge", async () => {
    const measured = { model: "m", inputTokens: 120, costMicrocents: 900, costSource: "measured" };
    structured.generate.mockResolvedValueOnce({ output: { status: "draft" }, charge: measured });
    const spend = usage();
    const caller = new HostedComposeModelCaller(spend, () => NOW);

    await expect(asUser(() => caller.call(CALL))).resolves.toEqual({ ok: true, value: { status: "draft" } });

    expect(spend.prepareRetrieval).toHaveBeenCalledWith(user.id, NOW, "automationCompose");
    expect(spend.reserveRetrieval).toHaveBeenCalledWith({
      grant: GRANT,
      worstCaseMicrocents: 5_000,
      model: AGENT_MODELS.setupDrafting.modelId,
      now: NOW,
    });
    expect(structured.generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: AGENT_MODELS.setupDrafting, system: "system", prompt: "prompt" }),
    );
    expect(spend.settleRetrieval).toHaveBeenCalledWith({ reservation: RESERVATION, charge: measured, now: NOW });
  });

  it("settles the estimate and reports unavailable when the model answers nothing or throws", async () => {
    structured.generate.mockResolvedValueOnce({ output: null, charge: null });
    const spend = usage();
    const caller = new HostedComposeModelCaller(spend, () => NOW);
    await expect(asUser(() => caller.call(CALL))).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(spend.settleRetrieval).toHaveBeenCalledWith({ reservation: RESERVATION, charge: null, now: NOW });

    structured.generate.mockRejectedValueOnce(new Error("provider down"));
    const failing = usage();
    await expect(asUser(() => new HostedComposeModelCaller(failing, () => NOW).call(CALL))).rejects.toThrow(
      "provider down",
    );
    expect(failing.settleRetrieval).toHaveBeenCalledWith({
      reservation: RESERVATION,
      charge: expect.objectContaining({ costMicrocents: 5_000, costSource: "estimated" }),
      now: NOW,
    });
  });

  it("refuses with credits when the member's credits are used up and otherwise as unavailable, without calling the model", async () => {
    const exhausted = usage({ reserved: false, blockedReason: "credits_exhausted" });
    await expect(asUser(() => new HostedComposeModelCaller(exhausted, () => NOW).call(CALL))).resolves.toEqual({
      ok: false,
      reason: "credits",
    });

    const noGrant = usage({ grant: false });
    await expect(asUser(() => new HostedComposeModelCaller(noGrant, () => NOW).call(CALL))).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(noGrant.reserveRetrieval).not.toHaveBeenCalled();
    expect(structured.generate).not.toHaveBeenCalled();
    expect(exhausted.settleRetrieval).not.toHaveBeenCalled();
  });
});
