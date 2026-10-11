import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const model = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/ee/agent-chat/structured-model-call", () => ({
  generateStructuredObject: model.generate,
  structuredCallWorstCaseMicrocents: () => 5_000,
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { AGENT_MODELS } from "@/ee/agent-chat/model-catalog";
import { createMockUser } from "@/tests/helpers/mock-user";

import { WorkspaceSetupModelService } from "../workspace-setup-model.service";
import { WORKSPACE_SETUP_SPEND_CAP_MICROCENTS } from "../workspace-setup-spend";

const owner = createMockUser({ companyId: "company-setup" });
const call = {
  label: "Plan",
  purpose: "setupPlanning" as const,
  schema: z.object({ ok: z.boolean() }),
  system: "s",
  prompt: "p",
};

function harness() {
  const usage = {
    reserveWorkspacePlatform: vi.fn(
      (): Promise<{ status: "reserved"; id: string } | { status: "cap" | "unavailable" }> =>
        Promise.resolve({ status: "reserved", id: "hold" }),
    ),
    settlePlatformRetrieval: vi.fn(() => Promise.resolve()),
  };
  return { usage, service: new WorkspaceSetupModelService(usage) };
}

beforeEach(() => model.generate.mockReset());

describe("workspace setup model calls", () => {
  it("reserves the worst case against the workspace cap, calls the purpose model and settles the receipt", async () => {
    const { usage, service } = harness();
    const charge = {
      model: AGENT_MODELS.setupPlanning.modelId,
      inputTokens: 10,
      costMicrocents: 900,
      costSource: "measured",
    };
    model.generate.mockResolvedValue({ output: { ok: true }, charge });
    await expect(runWithTenant(owner, () => service.generate(call))).resolves.toEqual({
      ok: true,
      value: { ok: true },
    });
    expect(usage.reserveWorkspacePlatform).toHaveBeenCalledWith({
      companyId: "company-setup",
      purpose: "workspaceSetup",
      model: "anthropic/claude-sonnet-5.5",
      worstCaseMicrocents: 5_000,
      capMicrocents: WORKSPACE_SETUP_SPEND_CAP_MICROCENTS,
    });
    expect(model.generate.mock.calls[0][0].model).toBe(AGENT_MODELS.setupPlanning);
    expect(usage.settlePlatformRetrieval).toHaveBeenCalledWith({ reservationId: "hold", charge });
  });

  it("refuses without a provider call when the cap is reached or hosted AI is unavailable", async () => {
    const { usage, service } = harness();
    usage.reserveWorkspacePlatform
      .mockResolvedValueOnce({ status: "cap" })
      .mockResolvedValueOnce({ status: "unavailable" });
    await expect(runWithTenant(owner, () => service.generate(call))).resolves.toEqual({
      ok: false,
      failure: "spendCap",
    });
    await expect(runWithTenant(owner, () => service.generate(call))).resolves.toEqual({
      ok: false,
      failure: "aiUnavailable",
    });
    expect(model.generate).not.toHaveBeenCalled();
    expect(usage.settlePlatformRetrieval).not.toHaveBeenCalled();
  });

  it("settles a failed call at its reported charge and names the failure", async () => {
    const { usage, service } = harness();
    const charge = {
      model: "anthropic/claude-sonnet-5.5",
      inputTokens: 0,
      costMicrocents: 5_000,
      costSource: "estimated",
    };
    model.generate.mockResolvedValue({
      output: null,
      charge,
      failure: "Plan model call failed.",
      failureScope: "request",
    });
    await expect(runWithTenant(owner, () => service.generate(call))).resolves.toEqual({
      ok: false,
      failure: "generation",
    });
    expect(usage.settlePlatformRetrieval).toHaveBeenCalledWith({ reservationId: "hold", charge });
    expect(service.drainWarnings()).toEqual(["Plan model call failed."]);
  });
});
