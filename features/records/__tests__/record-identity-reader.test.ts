import { describe, expect, it, vi } from "vitest";
import { createCrmPreset, presetId } from "../crm-preset";
import type { RecordRepo } from "../record.repo";
import type { RecordAccessPolicy } from "../record-access";
import type { RecordSearchRow } from "../record-search-query";
import { RecordIdentityReader } from "../record-identity-reader";

vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: (fn: () => unknown) => fn(),
}));

function fixture() {
  const companyId = "70000000-0000-4000-8000-000000000001";
  const model = createCrmPreset(companyId, "EUR");
  const contact = {
    typeId: presetId(companyId, "contact"),
    recordId: "70000000-0000-4000-8000-000000000002",
  };
  const organization = {
    typeId: presetId(companyId, "organization"),
    recordId: "70000000-0000-4000-8000-000000000003",
  };
  const identityId = "70000000-0000-4000-8000-000000000004";
  model.capabilities.push({
    id: "70000000-0000-4000-8000-000000000005",
    kind: "channels",
    typeId: organization.typeId,
    fields: [],
  });
  const owners = [contact, organization].map((ref) => ({
    channelClass: "email",
    value: "alice@example.test",
    identityId,
    ref,
  }));
  const rows = [contact, organization].map((ref, index) => ({
    ...ref,
    state: "value",
    title: index ? "Acme" : "Alice",
    pictureUrl: null,
    createdAt: new Date().toISOString(),
    errorCode: null,
  })) as RecordSearchRow[];
  const repo = {
    getModel: vi.fn(async () => model),
    getIdentityOwnersCompanyWide: vi.fn(async () => owners),
    searchRecords: vi.fn(async () => rows),
  } as unknown as RecordRepo;
  const policy = {
    load: vi.fn(async () => ({
      actor: { id: "actor" },
      access: () => new Map(),
      allowed: () => true,
    })),
  } as unknown as RecordAccessPolicy;
  return {
    model,
    contact,
    organization,
    identityId,
    owners,
    rows,
    repo,
    reader: new RecordIdentityReader(repo, policy),
  };
}

describe("shared identifier resolution", () => {
  it("returns every accessible association for each original input and batches matching keys", async () => {
    const f = fixture();
    const result = await f.reader.resolve([
      { provider: "outlook", value: "ALICE@example.test" },
      { provider: "google", value: "alice@example.test" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      provider: "outlook",
      value: "ALICE@example.test",
    });
    expect(result.map((match) => match.records.map((record) => record.ref))).toEqual([
      expect.arrayContaining([f.contact, f.organization]),
      expect.arrayContaining([f.contact, f.organization]),
    ]);
    expect(
      result[0].records.every(
        (record) => record.identityId === f.identityId && record.typeLabel && record.typePluralLabel,
      ),
    ).toBe(true);
    expect(f.repo.getIdentityOwnersCompanyWide).toHaveBeenCalledTimes(1);
    expect(f.repo.searchRecords).toHaveBeenCalledTimes(1);
  });

  it("omits inaccessible associations without publishing hidden counts or owners", async () => {
    const f = fixture();
    vi.mocked(f.repo.searchRecords).mockResolvedValue([f.rows[0]]);
    const result = await f.reader.resolve([{ provider: "mail", value: "alice@example.test" }]);
    expect(result[0].records).toHaveLength(1);
    expect(result[0].records[0].ref).toEqual(f.contact);
    expect(JSON.stringify(result)).not.toContain(f.organization.recordId);
    vi.mocked(f.repo.searchRecords).mockResolvedValue([]);
    expect(await f.reader.resolve([{ provider: "mail", value: "alice@example.test" }])).toEqual([
      { provider: "mail", value: "alice@example.test", records: [] },
    ]);
  });

  it("supports type filters and disabled Channels while retaining associations", async () => {
    const f = fixture();
    const filtered = await f.reader.resolve(
      [{ provider: "mail", value: "alice@example.test" }],
      [f.organization.typeId],
    );
    expect(filtered[0].records.map((record) => record.ref)).toEqual([f.organization]);
    const binding = f.model.capabilities.find(
      (binding) => binding.kind === "channels" && binding.typeId === f.organization.typeId,
    );
    if (!binding) throw new Error("Missing fixture capability");
    binding.enabled = false;
    expect(
      (await f.reader.resolve([{ provider: "mail", value: "alice@example.test" }]))[0].records.map(
        (record) => record.ref,
      ),
    ).toEqual([f.contact]);
    expect(f.owners).toHaveLength(2);
  });
});
