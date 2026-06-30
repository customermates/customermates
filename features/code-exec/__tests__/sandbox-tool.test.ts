import { describe, expect, it, vi } from "vitest";

// Mock the DI graph (like sandbox-data.test) so importing the service doesn't spin up
// the real better-auth context in the unit env. The capability gate we assert here
// returns BEFORE any tool/DI is touched anyway.
vi.mock("@/core/di", () => {
  const stub = () => ({ invoke: vi.fn().mockResolvedValue({ ok: true, data: {} }) });
  return {
    getGetContactByIdInteractor: stub,
    getGetContactsConfigurationInteractor: stub,
    getGetOrganizationByIdInteractor: stub,
    getGetOrganizationsConfigurationInteractor: stub,
    getGetDealByIdInteractor: stub,
    getGetDealsConfigurationInteractor: stub,
    getGetServiceByIdInteractor: stub,
    getGetServicesConfigurationInteractor: stub,
    getGetTaskByIdInteractor: stub,
    getGetTasksConfigurationInteractor: stub,
  };
});
vi.mock("@/features/search/entity-list-executors", () => ({ entityListExecutors: {}, entityNameExtractors: {} }));

const { runSandboxTool } = await import("../sandbox-data.service");

const ctx = (caps: string[]) => ({ jti: crypto.randomUUID(), caps, companyId: "co" });

describe("runSandboxTool capability gate", () => {
  it("refuses to run any tool without the 'tool' capability on the run token", async () => {
    for (const name of ["filter_entity", "delete_entities", "send_email"]) {
      const r = await runSandboxTool({ name, args: {} }, ctx([]));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/not authorized/i);
    }
  });

  it("also refuses when caps has read but not tool", async () => {
    const r = await runSandboxTool({ name: "delete_entities", args: {} }, ctx(["read"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not authorized/i);
  });
});
