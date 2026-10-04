import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_PRISMA_DB_MODULE } from "@/tests/helpers/interactor-test-setup";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordRequestHash } from "@/features/records/mutate-record.interactor";
import { MutateThreadRecordsInteractor } from "../thread-records.interactor";
import { ReadThreadRecordsInteractor } from "../read-thread-records.interactor";

const user = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => user));
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const threadId = "00000000-0000-4000-8000-000000000001";
const model = createCrmPreset(user.companyId, "EUR");
const ref = { typeId: presetId(user.companyId, "deal"), recordId: "00000000-0000-4000-8000-000000000002" };
const input = {
  action: "link" as const,
  threadId,
  ref,
  expectedRevision: model.revision,
  idempotencyKey: "00000000-0000-4000-8000-000000000003",
};

function fixture() {
  const links = {
    canAccessThread: vi.fn().mockResolvedValue(true),
    listLinks: vi.fn().mockResolvedValue([]),
    has: vi.fn().mockResolvedValue(false),
    link: vi.fn(),
    unlink: vi.fn(),
    audit: vi.fn(),
  };
  const access = {
    actor: user,
    allowedSystem: vi.fn().mockReturnValue(true),
    allowed: vi.fn().mockReturnValue(true),
    canRead: vi.fn().mockResolvedValue(true),
    access: vi.fn().mockReturnValue(new Map()),
  };
  const policy = { load: vi.fn().mockResolvedValue(access) };
  const records = {
    getRecordCompanyWide: vi
      .fn()
      .mockResolvedValue({ companyId: user.companyId, typeId: ref.typeId, id: ref.recordId }),
    receipt: vi.fn().mockResolvedValue(null),
    saveReceipt: vi.fn(),
    getState: vi.fn().mockResolvedValue({ revision: model.revision }),
    getModel: vi.fn().mockResolvedValue(model),
    searchRecords: vi.fn().mockResolvedValue([]),
  };
  const args = [
    links,
    records as unknown as RecordRepo,
    policy as unknown as RecordAccessPolicy,
    mockEntitlementService(),
  ] as const;
  return {
    links,
    access,
    records,
    policy,
    read: new ReadThreadRecordsInteractor(...args),
    mutate: new MutateThreadRecordsInteractor(...args),
  };
}

describe("conversation record authorization and atomic mutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps an empty link collection empty without querying the whole workspace", async () => {
    const f = fixture();
    expect(await f.read.invoke({ threadId })).toMatchObject({ ok: true, data: { records: [] } });
    expect(f.records.searchRecords).not.toHaveBeenCalled();
  });

  it.each(["inbox", "update", "record"])("rejects missing %s permission before writing", async (denial) => {
    const f = fixture();
    if (denial === "inbox") f.access.allowedSystem.mockReturnValue(false);
    if (denial === "update") f.access.allowed.mockReturnValue(false);
    if (denial === "record") f.access.canRead.mockResolvedValue(false);
    expect(await f.mutate.invoke(input)).toMatchObject({ ok: false });
    expect(f.links.link).not.toHaveBeenCalled();
    expect(f.records.saveReceipt).not.toHaveBeenCalled();
  });

  it("does not expose a private or foreign thread even with record edit authority", async () => {
    const f = fixture();
    f.links.canAccessThread.mockResolvedValue(false);
    expect(await f.read.invoke({ threadId })).toMatchObject({ ok: false });
    expect(await f.mutate.invoke(input)).toMatchObject({ ok: false });
    expect(f.links.listLinks).not.toHaveBeenCalled();
    expect(f.links.link).not.toHaveBeenCalled();
  });

  it("blocks protected records, paused writes and stale configuration before mutation", async () => {
    for (const mode of ["protected", "paused", "stale"]) {
      const f = fixture();
      if (mode === "protected")
        f.records.getRecordCompanyWide.mockResolvedValue({ protectedKind: "membershipAuthorization" });
      if (mode === "paused") f.records.getState.mockResolvedValue({ activeOperationId: threadId });
      const result = await f.mutate.invoke({
        ...input,
        expectedRevision: mode === "stale" ? model.revision - 1 : model.revision,
      });
      expect(result.ok).toBe(false);
      expect(f.links.link).not.toHaveBeenCalled();
    }
  });

  it("audits a new link, saves a receipt and does not duplicate an existing association", async () => {
    const f = fixture();
    expect(await f.mutate.invoke(input)).toMatchObject({ ok: true, data: { ref, linked: true } });
    expect(f.links.link).toHaveBeenCalledWith(threadId, ref);
    expect(f.links.audit).toHaveBeenCalledWith(threadId, ref, "link");
    expect(f.records.saveReceipt).toHaveBeenCalledOnce();
    f.links.has.mockResolvedValue(true);
    f.links.link.mockClear();
    f.links.audit.mockClear();
    expect((await f.mutate.invoke({ ...input, idempotencyKey: threadId })).ok).toBe(true);
    expect(f.links.link).not.toHaveBeenCalled();
    expect(f.links.audit).not.toHaveBeenCalled();
  });

  it("replays identical receipts but rechecks revoked authority and rejects a changed payload", async () => {
    const f = fixture();
    f.records.receipt.mockResolvedValue({
      requestHash: recordRequestHash({ kind: "thread-record", input }),
      result: { ref, linked: true, schemaRevision: model.revision },
    });
    expect((await f.mutate.invoke(input)).ok).toBe(true);
    expect(f.links.link).not.toHaveBeenCalled();
    expect((await f.mutate.invoke({ ...input, action: "unlink" })).ok).toBe(false);
    f.access.allowed.mockReturnValue(false);
    expect((await f.mutate.invoke(input)).ok).toBe(false);
  });

  it("removes only the selected conversation association and rejects excess links", async () => {
    const f = fixture();
    f.links.has.mockResolvedValue(true);
    expect((await f.mutate.invoke({ ...input, action: "unlink" })).ok).toBe(true);
    expect(f.links.unlink).toHaveBeenCalledWith(threadId, ref);
    f.links.has.mockResolvedValue(false);
    f.links.listLinks.mockResolvedValue(Array(100).fill(ref));
    expect((await f.mutate.invoke(input)).ok).toBe(false);
    expect(f.links.link).not.toHaveBeenCalled();
  });
});
