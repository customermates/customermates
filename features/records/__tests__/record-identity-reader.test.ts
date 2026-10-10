import { describe, expect, it, vi } from "vitest";
import { createCrmPreset, presetId } from "../crm-preset";
import type { RecordRepo } from "../record.repo";
import type { RecordAccessPolicy } from "../record-access";
import type { RecordSearchRow } from "../record-search-query";
import { IDENTITY_MATCH_DISPLAY_LIMIT, RecordIdentityReader } from "../record-identity-reader";

vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: (fn: () => unknown) => fn(),
}));

function fixture() {
  const companyId = "70000000-0000-4000-8000-000000000001";
  const model = createCrmPreset(companyId);
  const contact = {
    typeId: presetId(companyId, "contact"),
    recordId: "70000000-0000-4000-8000-000000000002",
  };
  const organization = {
    typeId: presetId(companyId, "organization"),
    recordId: "70000000-0000-4000-8000-000000000003",
  };
  const identityId = "70000000-0000-4000-8000-000000000004";
  model.fields.push({
    id: "70000000-0000-4000-8000-000000000005",
    typeId: organization.typeId,
    label: "Channels",
    valueType: "channels",
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 99,
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
    version: index + 3,
    errorCode: null,
  })) as RecordSearchRow[];
  const repo = {
    getModel: vi.fn(() => Promise.resolve(model)),
    getIdentityOwnersCompanyWide: vi.fn(() => Promise.resolve(owners)),
    searchRecords: vi.fn(() => Promise.resolve(rows)),
  };
  const policy = {
    load: vi.fn(() =>
      Promise.resolve({
        actor: { id: "actor" },
        access: () => new Map(),
        allowed: () => true,
      }),
    ),
  } as unknown as RecordAccessPolicy;
  return {
    model,
    contact,
    organization,
    identityId,
    owners,
    rows,
    repo,
    reader: new RecordIdentityReader(repo as unknown as RecordRepo, policy),
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
    expect(f.repo.getIdentityOwnersCompanyWide).toHaveBeenCalledWith(
      [
        { channelClass: "email", value: "alice@example.test" },
        { channelClass: "email", value: "alice@example.test" },
      ],
      expect.arrayContaining([f.contact.typeId, f.organization.typeId]),
      { access: expect.any(Map), limitPerKey: IDENTITY_MATCH_DISPLAY_LIMIT },
    );
    expect(f.repo.searchRecords).toHaveBeenCalledTimes(1);
  });

  it("marks a display lookup that omitted further records, and leaves complete lookups unbounded", async () => {
    const f = fixture();
    const refs = Array.from({ length: IDENTITY_MATCH_DISPLAY_LIMIT + 1 }, (_, index) => ({
      typeId: f.contact.typeId,
      recordId: `70000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
    }));
    vi.mocked(f.repo.getIdentityOwnersCompanyWide).mockResolvedValue(
      refs.map((ref) => ({ channelClass: "email", value: "alice@example.test", identityId: f.identityId, ref })),
    );
    vi.mocked(f.repo.searchRecords).mockResolvedValue(refs.map((ref) => ({ ...f.rows[0], ...ref })));
    const [display] = await f.reader.resolve([{ provider: "mail", value: "alice@example.test" }]);
    expect(display.records).toHaveLength(IDENTITY_MATCH_DISPLAY_LIMIT);
    expect(display.moreRecords).toBe(true);
    const [complete] = await f.reader.resolve([{ provider: "mail", value: "alice@example.test" }], undefined, {
      complete: true,
    });
    expect(complete.records).toHaveLength(IDENTITY_MATCH_DISPLAY_LIMIT + 1);
    expect(complete).not.toHaveProperty("moreRecords");
    expect(f.repo.getIdentityOwnersCompanyWide).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Array), {
      access: expect.any(Map),
    });
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

  it("never offers editing a protected record through a channel match", async () => {
    const f = fixture();
    f.rows[0].protectedKind = "membershipAuthorization";
    const result = await f.reader.resolve([{ provider: "mail", value: "alice@example.test" }]);
    expect(result[0].records.find((record) => record.ref.recordId === f.contact.recordId)?.canEdit).toBe(false);
    expect(result[0].records.find((record) => record.ref.recordId === f.organization.recordId)?.canEdit).toBe(true);
  });

  it("supports type filters and disabled Channels while retaining associations", async () => {
    const f = fixture();
    const filtered = await f.reader.resolve(
      [{ provider: "mail", value: "alice@example.test" }],
      [f.organization.typeId],
    );
    expect(filtered[0].records.map((record) => record.ref)).toEqual([f.organization]);
    expect(f.repo.getIdentityOwnersCompanyWide).toHaveBeenLastCalledWith(
      [{ channelClass: "email", value: "alice@example.test" }],
      [f.organization.typeId],
      { access: expect.any(Map), limitPerKey: IDENTITY_MATCH_DISPLAY_LIMIT },
    );
    const channels = f.model.fields.find(
      (field) => field.valueType === "channels" && field.typeId === f.organization.typeId,
    );
    if (!channels) throw new Error("Missing fixture Channels field");
    channels.archived = true;
    expect(
      (await f.reader.resolve([{ provider: "mail", value: "alice@example.test" }]))[0].records.map(
        (record) => record.ref,
      ),
    ).toEqual([f.contact]);
    expect(f.owners).toHaveLength(2);
  });

  it("returns versions and the schema revision for updates while display lookups keep their shape", async () => {
    const f = fixture();
    const lookup = [
      { provider: "mail" as const, value: "alice@example.test" },
      { provider: "mail" as const, value: "alice@example.test" },
    ];
    const display = await f.reader.resolve(lookup);
    expect(display[0].records.every((record) => !("version" in record))).toBe(true);
    const forUpdate = await f.reader.resolveForUpdate(lookup);
    expect(forUpdate.schemaRevision).toBe(f.model.revision);
    expect(forUpdate.matches).toHaveLength(2);
    for (const match of forUpdate.matches) {
      expect(match.records.map(({ ref, version }) => ({ ref, version }))).toEqual(
        expect.arrayContaining([
          { ref: f.contact, version: 3 },
          { ref: f.organization, version: 4 },
        ]),
      );
      expect(match).not.toHaveProperty("moreRecords");
    }
    expect(f.repo.getIdentityOwnersCompanyWide).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Array), {
      access: expect.any(Map),
    });
    expect(f.repo.getModel).toHaveBeenCalledTimes(2);
    expect(f.repo.searchRecords).toHaveBeenCalledTimes(2);
    expect(await f.reader.resolveForUpdate([])).toEqual({ schemaRevision: f.model.revision, matches: [] });
    expect(f.repo.getIdentityOwnersCompanyWide).toHaveBeenCalledTimes(2);
  });
});
