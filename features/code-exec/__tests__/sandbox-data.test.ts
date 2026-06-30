import { beforeEach, describe, expect, it, vi } from "vitest";

const listMock = vi.fn();

vi.mock("@/features/search/entity-list-executors", () => ({
  entityListExecutors: {
    contact: (...a: unknown[]) => listMock(...a),
    organization: (...a: unknown[]) => listMock(...a),
    deal: (...a: unknown[]) => listMock(...a),
    service: (...a: unknown[]) => listMock(...a),
    task: (...a: unknown[]) => listMock(...a),
  },
  entityNameExtractors: {
    contact: (i: any) => `${i.firstName} ${i.lastName}`,
    organization: (i: any) => i.name,
    deal: (i: any) => i.name,
    service: (i: any) => i.name,
    task: (i: any) => i.name,
  },
}));

vi.mock("@/core/di", () => {
  const stub = () => ({ invoke: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }) });
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

const { runSandboxRead } = await import("../sandbox-data.service");

beforeEach(() => {
  listMock.mockReset();
  listMock.mockResolvedValue({
    ok: true,
    data: { items: [{ id: "1", firstName: "A", lastName: "B" }], pagination: { total: 1 } },
  });
});

describe("runSandboxRead (data broker)", () => {
  it("returns shaped list data and NEVER forwards a body companyId", async () => {
    const r = await runSandboxRead("list", { entity: "contact", companyId: "co_EVIL", pageSize: 10 });

    expect(r.ok).toBe(true);
    expect((r as { ok: true; data: any }).data.total).toBe(1);

    const callArg = listMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("companyId"); // zod stripped the injected tenant id
    expect(callArg.pagination).toEqual({ page: 1, pageSize: 10 });
  });

  it("rejects an unknown operation", async () => {
    const r = await runSandboxRead("evals; DROP TABLE", {});
    expect(r.ok).toBe(false);
  });

  it("rejects invalid params", async () => {
    const r = await runSandboxRead("list", { entity: "not-an-entity" });
    expect(r.ok).toBe(false);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("count returns only the total", async () => {
    const r = await runSandboxRead("count", { entity: "deal" });
    expect(r).toEqual({ ok: true, data: { total: 1 } });
  });
});
