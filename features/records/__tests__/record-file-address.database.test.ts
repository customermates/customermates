import type { RecordMutation } from "../record-query.schema";
import type { RecordAddress, RecordField } from "../record-model.schema";

import { PermissionService } from "@/core/base/permission.service";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { RecordTrashService } = await import("../record-trash.service");
const { GetRecordInteractor } = await import("../get-record.interactor");
const { QueryRecordsInteractor } = await import("../query-records.interactor");
const { RecordQuerySchema } = await import("../record-query.schema");
const { RecordFileAttachmentService } = await import("../record-file-attachment.service");
const { PrismaRecordFileRepo } = await import("../prisma-record-file.repository");
const { verifiedRecordAddress } = await import("../record-address");
const { RecordHistoryReader } = await import("../record-history-reader");
const { RecordEventPayloadSchema } = await import("../record-event.schema");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { createTestRecordRepo, preloadTestRecordRepo } = await import("@/tests/helpers/record-repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

const VERIFIED_TOKEN = "candidate-mannheim";

const verifiedAddress = verifiedRecordAddress(
  { street: "Hauptstraße 5", line2: null, postalCode: "68159", city: "Mannheim", region: null, countryCode: "de" },
  { provider: "photon", checkedAt: "2026-10-14T12:00:00.000Z", location: { lat: 49.4875, lon: 8.466 } },
);

function inputField(
  id: string,
  typeId: string,
  label: string,
  valueType: RecordField["valueType"],
  position: number,
  multiple = valueType === "file",
) {
  return {
    id,
    typeId,
    label,
    valueType,
    behavior: { kind: "input" as const },
    required: false,
    multiple: multiple || undefined,
    archived: false,
    publishedSummary: false,
    options: [],
    position,
  } satisfies RecordField;
}

async function fixture() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Admin",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, user };
  });
  const companyId = seed.company.id;
  const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const calculations = new RecordCalculationService(repo);
  const verifier = {
    verify: (token: string) => Promise.resolve(token === VERIFIED_TOKEN ? verifiedAddress : null),
  };
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(
      repo,
      policy,
      calculations,
      verifier,
      new RecordFileAttachmentService(new PrismaRecordFileRepo()),
    ),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const id = (key: string) => presetId(companyId, key);
  const typeId = id("deal");
  const files = id("deal.files");
  const address = id("deal.address");
  const single = id("deal.contract");
  const model = createCrmPreset(companyId);
  const position = Math.max(...model.fields.map((field) => field.position)) + 1;
  model.fields.push(
    inputField(files, typeId, "Files", "file", position),
    inputField(address, typeId, "Address", "address", position + 1),
    inputField(single, typeId, "Contract", "file", position + 2, false),
  );
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const run = <T>(fn: () => Promise<T>) => runWithTenant(admin, fn);
  const revision = async () =>
    (await runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } }))).revision;
  const mutation = async (value: RecordMutation) =>
    run(async () =>
      mutate.invoke({ mutation: value, expectedRevision: await revision(), idempotencyKey: randomUUID() }),
    );
  const upload = (name: string, fieldId = files) =>
    runWithoutTenant(async () => {
      const file = await prisma.recordFile.create({
        data: {
          companyId,
          typeId,
          fieldId,
          storageDriver: "database",
          storageKey: `${companyId}/${randomUUID()}`,
          name,
          mimeType: "application/pdf",
          size: 1234n,
          uploadedById: seed.user.id,
        },
      });
      return file.id;
    });
  const createDeal = async (fields: Extract<RecordMutation, { action: "create" }>["fields"]) => {
    const result = await mutation({
      action: "create",
      typeId,
      fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: "Deal" } }, ...fields],
    });
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    return { typeId, recordId: result.data.refs[0].recordId };
  };
  const read = async (ref: { typeId: string; recordId: string }) => {
    const result = await run(() => new GetRecordInteractor(repo, policy).invoke(ref));
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.data;
  };
  const value = async (ref: { typeId: string; recordId: string }, fieldId: string) =>
    (await read(ref)).fields.find((entry) => entry.fieldId === fieldId)?.result;
  const version = async (ref: { typeId: string; recordId: string }) =>
    (await run(() => repo.getRecordCompanyWide(ref)))?.version ?? 0;
  const fileRow = (fileId: string) =>
    runWithoutTenant(() => prisma.recordFile.findUniqueOrThrow({ where: { id: fileId } }));
  const query = new QueryRecordsInteractor(repo, policy);
  const history = async (ref: { typeId: string; recordId: string }, fieldId: string) => {
    const [event] = await runWithoutTenant(() =>
      prisma.eventLog.findMany({
        where: { companyId, subjectTypeId: ref.typeId, subjectId: ref.recordId },
        orderBy: { createdAt: "desc" },
        take: 1,
      }),
    );
    const redacted = await run(async () =>
      new RecordHistoryReader(repo).redact(
        RecordEventPayloadSchema.parse(event.payload),
        await repo.getModel(),
        await policy.load(),
      ),
    );
    return redacted?.fields.find((entry) => entry.fieldId === fieldId);
  };
  return {
    companyId,
    typeId,
    name: id("deal.name"),
    files,
    address,
    single,
    mutation,
    upload,
    createDeal,
    read,
    value,
    version,
    fileRow,
    run,
    query,
    history,
  };
}

function addressValue(parts: Partial<RecordAddress>): RecordAddress {
  return {
    street: null,
    line2: null,
    postalCode: null,
    city: null,
    region: null,
    countryCode: null,
    formatted: "",
    location: null,
    verification: { status: "unverified", provider: null, checkedAt: null },
    ...parts,
  };
}

describeDatabase("file and address values in the record engine", () => {
  beforeAll(() => preloadTestRecordRepo(), 120_000);

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("attaches uploaded files in order, returns their metadata and detaches removed files", async () => {
    const f = await fixture();
    const contract = await f.upload("Contract.pdf");
    const offer = await f.upload("Offer.pdf");
    const ref = await f.createDeal([{ fieldId: f.files, value: { kind: "file", value: [offer, contract] } }]);

    const record = await f.read(ref);
    expect(record.fields.find((entry) => entry.fieldId === f.files)?.result).toEqual({
      state: "value",
      value: { kind: "file", value: [offer, contract] },
    });
    expect(record.files?.map((file) => [file.id, file.name, file.size])).toEqual([
      [offer, "Offer.pdf", 1234],
      [contract, "Contract.pdf", 1234],
    ]);
    expect(await f.fileRow(contract)).toMatchObject({ recordId: ref.recordId, status: "ready" });

    const updated = await f.mutation({
      action: "update",
      ref,
      expectedVersion: await f.version(ref),
      fields: [{ fieldId: f.files, value: { kind: "file", value: [contract] } }],
    });
    expect(updated.ok).toBe(true);
    expect(await f.history(ref, f.files)).toMatchObject({
      before: {
        files: [
          { id: offer, name: "Offer.pdf" },
          { id: contract, name: "Contract.pdf" },
        ],
      },
      after: { files: [{ id: contract, name: "Contract.pdf" }] },
    });
    expect(await f.fileRow(offer)).toMatchObject({ recordId: ref.recordId, status: "detached" });
    expect((await f.fileRow(offer)).detachedAt).toBeInstanceOf(Date);
    expect(await f.fileRow(contract)).toMatchObject({ status: "ready" });

    const empty = await f.createDeal([]);
    const ids = async (query: object) => {
      const result = await f.run(() => f.query.invoke(RecordQuerySchema.parse({ typeId: f.typeId, ...query })));
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.data.records.map((entry) => entry.ref.recordId);
    };
    expect(await ids({ search: "contract" })).toEqual([ref.recordId]);
    expect(await ids({ search: "offer" })).toEqual([]);
    expect(await ids({ filters: [{ fieldId: f.files, operator: "notEmpty", value: null }] })).toEqual([ref.recordId]);
    expect(await ids({ filters: [{ fieldId: f.files, operator: "empty", value: null }] })).toEqual([empty.recordId]);

    const trashed = await f.mutation({ action: "delete", ref, expectedVersion: await f.version(ref) });
    expect(trashed.ok).toBe(true);
    expect(await f.fileRow(contract)).toMatchObject({ recordId: ref.recordId, status: "ready" });

    const cleared = await f.upload("Cleared.pdf");
    const other = await f.createDeal([{ fieldId: f.files, value: { kind: "file", value: [cleared] } }]);
    const removed = await f.mutation({
      action: "update",
      ref: other,
      expectedVersion: await f.version(other),
      fields: [{ fieldId: f.files, value: null }],
    });
    expect(removed.ok).toBe(true);
    expect(await f.value(other, f.files)).toEqual({ state: "missing" });
    expect(await f.fileRow(cleared)).toMatchObject({ recordId: other.recordId, status: "detached" });
  });

  it("finds a record by a file name only while its field lists the file", async () => {
    const f = await fixture();
    const proposal = await f.upload("Proposal.pdf");
    const ref = await f.createDeal([{ fieldId: f.files, value: { kind: "file", value: [proposal] } }]);
    const ids = async (search: string) => {
      const result = await f.run(() => f.query.invoke(RecordQuerySchema.parse({ typeId: f.typeId, search })));
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.data.records.map((entry) => entry.ref.recordId);
    };
    expect(await ids("proposal")).toEqual([ref.recordId]);

    await runWithoutTenant(() =>
      prisma.recordValue.updateMany({
        where: { companyId: f.companyId, recordId: ref.recordId, fieldId: f.files },
        data: { textListValue: [], state: "missing" },
      }),
    );
    expect(await f.fileRow(proposal)).toMatchObject({ recordId: ref.recordId, status: "ready" });
    expect(await ids("proposal")).toEqual([]);
  });

  it("holds exactly one file in a single file field", async () => {
    const f = await fixture();
    const first = await f.upload("First.pdf", f.single);
    const second = await f.upload("Second.pdf", f.single);
    const refused = await f.mutation({
      action: "create",
      typeId: f.typeId,
      fields: [
        { fieldId: f.name, value: { kind: "text", value: "Two files" } },
        { fieldId: f.single, value: { kind: "file", value: [first, second] } },
      ],
    });
    expect(refused.ok).toBe(false);
    expect(await f.fileRow(first)).toMatchObject({ recordId: null, status: "pending" });
    const ref = await f.createDeal([{ fieldId: f.single, value: { kind: "file", value: [second] } }]);
    expect(await f.value(ref, f.single)).toEqual({ state: "value", value: { kind: "file", value: [second] } });
  });

  it("refuses files of another field, another record or another workspace", async () => {
    const f = await fixture();
    const other = await fixture();
    const foreignField = await f.upload("Elsewhere.pdf", f.address);
    const attached = await f.upload("Attached.pdf");
    await f.createDeal([{ fieldId: f.files, value: { kind: "file", value: [attached] } }]);
    const foreignWorkspace = await other.upload("Other.pdf");
    const unknown = randomUUID();

    for (const fileId of [foreignField, attached, foreignWorkspace, unknown]) {
      const result = await f.mutation({
        action: "create",
        typeId: f.typeId,
        fields: [
          { fieldId: f.name, value: { kind: "text", value: "Refused" } },
          { fieldId: f.files, value: { kind: "file", value: [fileId] } },
        ],
      });
      expect(result.ok, fileId).toBe(false);
      expect(JSON.stringify(result)).toContain("recordFileUnavailable");
    }
    expect(await f.fileRow(foreignWorkspace)).toMatchObject({ recordId: null, status: "pending" });
  });

  it("formats addresses on the server and lets only a lookup candidate store a verified address", async () => {
    const f = await fixture();
    const unknownCountry = await f.mutation({
      action: "create",
      typeId: f.typeId,
      fields: [
        { fieldId: f.name, value: { kind: "text", value: "Nowhere" } },
        { fieldId: f.address, value: { kind: "address", value: addressValue({ city: "Town", countryCode: "zz" }) } },
      ],
    });
    expect(unknownCountry.ok).toBe(false);
    expect(JSON.stringify(unknownCountry)).toContain("recordValueTypeMismatch");
    const ref = await f.createDeal([
      {
        fieldId: f.address,
        value: {
          kind: "address",
          value: addressValue({
            street: "  Hauptstraße 5 ",
            postalCode: "68159",
            city: "Mannheim",
            countryCode: "de",
            formatted: "Somewhere else entirely",
            location: { lat: 1, lon: 2 },
            verification: { status: "verified", provider: "client", checkedAt: "2026-10-14T00:00:00Z" },
          }),
        },
      },
    ]);
    expect(await f.value(ref, f.address)).toEqual({
      state: "value",
      value: {
        kind: "address",
        value: addressValue({
          street: "Hauptstraße 5",
          postalCode: "68159",
          city: "Mannheim",
          countryCode: "de",
          formatted: "Hauptstraße 5, 68159 Mannheim",
        }),
      },
    });

    const rejected = await f.mutation({
      action: "update",
      ref,
      expectedVersion: await f.version(ref),
      fields: [{ fieldId: f.address, value: { kind: "address", candidateToken: "forged" } }],
    });
    expect(rejected.ok).toBe(false);
    expect(JSON.stringify(rejected)).toContain("recordAddressCandidateInvalid");

    const verified = await f.mutation({
      action: "update",
      ref,
      expectedVersion: await f.version(ref),
      fields: [{ fieldId: f.address, value: { kind: "address", candidateToken: VERIFIED_TOKEN } }],
    });
    expect(verified.ok).toBe(true);
    expect(await f.value(ref, f.address)).toEqual({
      state: "value",
      value: { kind: "address", value: verifiedAddress },
    });

    const resent = await f.mutation({
      action: "update",
      ref,
      expectedVersion: await f.version(ref),
      fields: [
        {
          fieldId: f.address,
          value: {
            kind: "address",
            value: addressValue({ street: "Hauptstraße 5", postalCode: "68159", city: "Mannheim", countryCode: "de" }),
          },
        },
      ],
    });
    expect(resent.ok).toBe(true);
    expect(await f.value(ref, f.address)).toEqual({
      state: "value",
      value: { kind: "address", value: verifiedAddress },
    });

    const edited = await f.mutation({
      action: "update",
      ref,
      expectedVersion: await f.version(ref),
      fields: [
        {
          fieldId: f.address,
          value: {
            kind: "address",
            value: addressValue({ street: "Hauptstraße 7", postalCode: "68159", city: "Mannheim", countryCode: "de" }),
          },
        },
      ],
    });
    expect(edited.ok).toBe(true);
    expect(await f.value(ref, f.address)).toEqual({
      state: "value",
      value: {
        kind: "address",
        value: addressValue({
          street: "Hauptstraße 7",
          postalCode: "68159",
          city: "Mannheim",
          countryCode: "de",
          formatted: "Hauptstraße 7, 68159 Mannheim",
        }),
      },
    });

    const filtered = await f.run(() =>
      f.query.invoke(
        RecordQuerySchema.parse({
          typeId: f.typeId,
          filters: [{ fieldId: f.address, operator: "contains", value: { kind: "text", value: "straße 7" } }],
          sort: [{ fieldId: f.address, direction: "asc" }],
        }),
      ),
    );
    if (!filtered.ok) throw new Error(JSON.stringify(filtered));
    expect(filtered.data.records.map((entry) => entry.ref.recordId)).toEqual([ref.recordId]);
  });
});
