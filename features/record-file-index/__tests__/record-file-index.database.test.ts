import type { RecordField } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { TenantUser } from "@/features/user/user.schema";
import type { WikiEmbeddingService as WikiEmbeddingServiceType } from "@/ee/wiki-retrieval/wiki-embedding.service";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { docxFixture, pdfFixture } from "@/tests/helpers/record-file-fixtures";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "self-hosted",
  BASE_URL: "http://127.0.0.1:4000",
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: "test",
  CLOUD_HOSTED: true,
  AGENT_CHAT_DISABLED: false,
  FILE_STORAGE_DRIVER: "database",
}));
const embedMany = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), embedMany }));

const { PermissionService } = await import("@/core/base/permission.service");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { DatabaseFileStorageDriver } = await import("@/core/storage/database-file-storage.driver");
const { PrismaFileContentRepo } = await import("@/core/storage/prisma-file-content.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { RecordTrashService } = await import("@/features/records/record-trash.service");
const { QueryRecordsInteractor } = await import("@/features/records/query-records.interactor");
const { SearchRecordsInteractor } = await import("@/features/records/search-records.interactor");
const { RecordQuerySchema } = await import("@/features/records/record-query.schema");
const { RecordFileAttachmentService } = await import("@/features/records/record-file-attachment.service");
const { PrismaRecordFileRepo } = await import("@/features/records/prisma-record-file.repository");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { PrismaWikiPageRepo } = await import("@/features/wiki/prisma-wiki-page.repository");
const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { AgentUsageService } = await import("@/ee/agent-chat/agent-usage.service");
const { WikiEmbeddingService } = await import("@/ee/wiki-retrieval/wiki-embedding.service");
const { WikiSemanticQueryEmbedder } = await import("@/ee/wiki-retrieval/wiki-query-embedder");
const { WIKI_EMBEDDING_DIMENSIONS, WIKI_EMBEDDING_MODEL } = await import("@/ee/wiki-retrieval/wiki-embedding-model");
const { RecordFileSemanticIndexService } = await import("@/ee/record-file-index/record-file-semantic-index.service");
const { PrismaRecordFileSearchRepo } = await import("../prisma-record-file-search.repository");
const { RecordFileIndexService } = await import("../record-file-index.service");
const { IndexRecordFilesInteractor } = await import("../index-record-files.interactor");
const { SearchRecordFilesInteractor } = await import("../search-record-files.interactor");
const { ReadRecordFileContentInteractor } = await import("../read-record-file-content.interactor");
const { ExtractedRecordFileTextReader } = await import("../extracted-record-file-text-reader");
const { boundedRecordFileText } = await import("../record-file-text-chunk");
const { createTestRecordRepo, preloadTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { prismaAgentChatRepoDependencies } = await import("@/tests/helpers/prisma-agent-chat-repo");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const MAX_BYTES = 25 * 1024 * 1024;
const CREDIT = 1_000_000;

const CONCEPTS = [
  ["refund", "money back", "rückerstattung"],
  ["holiday", "vacation", "urlaub"],
  ["incident", "outage"],
];

function conceptVector(text: string): number[] {
  const lowered = text.toLowerCase();
  const vector = Array.from({ length: WIKI_EMBEDDING_DIMENSIONS }, () => 0);
  CONCEPTS.forEach((words, index) => {
    if (words.some((word) => lowered.includes(word))) vector[index] += 1;
  });
  vector[CONCEPTS.length] = 0.2;
  return vector;
}

function inputField(id: string, typeId: string, label: string, position: number, multiple: boolean) {
  return {
    id,
    typeId,
    label,
    valueType: "file" as const,
    behavior: { kind: "input" as const },
    required: false,
    multiple: multiple || undefined,
    archived: false,
    publishedSummary: false,
    options: [],
    position,
  } satisfies RecordField;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

async function workspace(options: { subscription?: boolean } = {}) {
  const anchor = new Date(Date.UTC(2026, 0, 15));
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    if (options.subscription) {
      await prisma.subscription.create({
        data: { companyId: company.id, status: "active", plan: "pro", agentCreditAnchorAt: anchor },
      });
    }
    const member = async (name: string, isSystemRole: boolean) => {
      const role = await prisma.userRole.create({ data: { companyId: company.id, name, isSystemRole } });
      const user = await prisma.user.create({
        data: {
          companyId: company.id,
          roleId: role.id,
          firstName: name,
          lastName: "Test",
          email: `${randomUUID()}@example.test`,
          status: "active",
          agentCreditActivatedAt: anchor,
        },
      });
      return Object.assign(createMockUser({ ...user, role: { ...role, permissions: [] } }), { roleId: role.id });
    };
    return {
      company,
      admin: await member("Administrator", true),
      own: await member("Own deals", false),
      contactsOnly: await member("Contacts only", false),
    };
  });
  const companyId = seed.company.id;
  const id = (key: string) => presetId(companyId, key);
  const typeId = id("deal");
  const files = id("deal.files");
  const contract = id("deal.contract");
  const repo = createTestRecordRepo();
  const model = createCrmPreset(companyId);
  const position = Math.max(...model.fields.map((field) => field.position)) + 1;
  model.fields.push(
    inputField(files, typeId, "Files", position, true),
    inputField(contract, typeId, "Contract", position + 1, false),
  );
  const { admin } = seed;
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  await runWithoutTenant(async () => {
    await prisma.recordTypeGrant.deleteMany({
      where: { companyId, roleId: { in: [seed.own.roleId, seed.contactsOnly.roleId] } },
    });
    await prisma.recordTypeGrant.createMany({
      data: [
        { companyId, typeId, roleId: seed.own.roleId, actions: ["readOwn"] },
        { companyId, typeId: id("contact"), roleId: seed.contactsOnly.roleId, actions: ["readAll"] },
      ],
    });
  });
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(
      repo,
      policy,
      new RecordCalculationService(repo),
      { verify: () => Promise.resolve(null) },
      new RecordFileAttachmentService(new PrismaRecordFileRepo()),
    ),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const revision = async () =>
    (await runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } }))).revision;
  const mutation = async (value: RecordMutation) => {
    const result = await runWithTenant(admin, async () =>
      mutate.invoke({ mutation: value, expectedRevision: await revision(), idempotencyKey: randomUUID() }),
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.data;
  };
  const version = async (ref: { typeId: string; recordId: string }) =>
    (await runWithTenant(admin, () => repo.getRecordCompanyWide(ref)))?.version ?? 0;
  const storage = new DatabaseFileStorageDriver(new PrismaFileContentRepo(companyId), mockEnv.BASE_URL);
  const upload = (name: string, mimeType: string, bytes: Uint8Array, fieldId = files) =>
    runWithoutTenant(async () => {
      const fileId = randomUUID();
      const storageKey = `${companyId}/${fileId}`;
      const written = await storage.writeStream(
        storageKey,
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        MAX_BYTES,
      );
      if (!written.ok) throw new Error("Upload failed");
      await prisma.recordFile.create({
        data: {
          id: fileId,
          companyId,
          typeId,
          fieldId,
          storageDriver: "database",
          storageKey,
          name,
          mimeType,
          size: BigInt(written.size),
          sha256: written.sha256,
          uploadedById: admin.id,
        },
      });
      return fileId;
    });
  const createDeal = async (name: string, fileIds: string[], fieldId = files) => {
    const created = await mutation({
      action: "create",
      typeId,
      fields: [
        { fieldId: id("deal.name"), value: { kind: "text", value: name } },
        ...(fileIds.length ? [{ fieldId, value: { kind: "file" as const, value: fileIds } }] : []),
      ],
    });
    if (created.status !== "completed") throw new Error(JSON.stringify(created));
    return { typeId, recordId: created.refs[0].recordId };
  };
  const embeddings = () =>
    new WikiEmbeddingService(new AgentUsageService(new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies())));
  const index = async (service: WikiEmbeddingServiceType = embeddings()) => {
    const interactor = new IndexRecordFilesInteractor(
      (scopedCompanyId) =>
        new RecordFileIndexService(
          new PrismaRecordFileRepo(scopedCompanyId),
          (driver) =>
            driver === "database"
              ? new DatabaseFileStorageDriver(new PrismaFileContentRepo(scopedCompanyId), mockEnv.BASE_URL)
              : null,
          new RecordFileSemanticIndexService(new PrismaRecordFileRepo(scopedCompanyId), service, scopedCompanyId),
        ),
    );
    const totals = { extracted: 0, embedded: 0 };
    for (let step = 0; step < 20; step += 1) {
      const outcome = await interactor.invoke({ companyId });
      totals.extracted += outcome.extracted;
      totals.embedded += outcome.embedded;
      if (!outcome.remaining) break;
    }
    return totals;
  };
  const schedule = vi.fn(() => Promise.resolve());
  const searchFiles = (user: TenantUser, query: string, semantic = false) =>
    runWithTenant(user, async () => {
      const service = embeddings();
      const result = await new SearchRecordFilesInteractor(
        repo,
        policy,
        new PrismaRecordFileSearchRepo(),
        new PrismaWikiPageRepo(new PermissionService()),
        semantic ? { embedder: new WikiSemanticQueryEmbedder(service), scheduler: { schedule } } : null,
      ).invoke({ query, limit: 5 });
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.data;
    });
  const searchRecords = (user: TenantUser, searchTerm: string) =>
    runWithTenant(user, async () => {
      const result = await new SearchRecordsInteractor(repo, policy).invoke({ searchTerm, limit: 40, cursor: null });
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.data.results.map((hit) => hit.ref.recordId);
    });
  const queryRecords = (user: TenantUser, search: string) =>
    runWithTenant(user, async () => {
      const result = await new QueryRecordsInteractor(repo, policy).invoke(RecordQuerySchema.parse({ typeId, search }));
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.data.records.map((record) => record.ref.recordId);
    });
  const read = (user: TenantUser, fileId: string) =>
    runWithTenant(user, () =>
      new ReadRecordFileContentInteractor(repo, policy, new PrismaRecordFileSearchRepo()).invoke({ fileId }),
    );
  const fileRow = (fileId: string) =>
    runWithoutTenant(() => prisma.recordFile.findUniqueOrThrow({ where: { id: fileId } }));
  return {
    ...seed,
    companyId,
    typeId,
    files,
    contract,
    id,
    repo,
    mutation,
    version,
    upload,
    createDeal,
    embeddings,
    index,
    schedule,
    searchFiles,
    searchRecords,
    queryRecords,
    read,
    fileRow,
  };
}

const QUARTERLY = pdfFixture([
  ["Quarterly report", "Revenue grew by eleven percent."],
  ["Renewal terms", "The subscription renews every twelve months unless cancelled."],
]);

describeDatabase("record file contents indexed like the Knowledge Base", () => {
  beforeAll(() => preloadTestRecordRepo(), 120_000);

  beforeEach(() => {
    mockEnv.APP_MODE = "cloud";
    embedMany.mockReset();
    embedMany.mockImplementation(({ values }: { values: string[] }) =>
      Promise.resolve({
        embeddings: values.map(conceptVector),
        usage: { tokens: values.reduce((total, value) => total + value.length, 0) },
        responses: [{}],
      }),
    );
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.agentUsageEvent.deleteMany({ where: { companyId: { in: companies } } });
      await prisma.company.deleteMany({ where: { id: { in: companies } } });
    });
  });

  it("extracts attached files, finds their records by content and opens a file at the matched section", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const pdf = await w.upload("Quarterly.pdf", "application/pdf", QUARTERLY);
    const docx = await w.upload(
      "Offer.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      docxFixture([{ heading: 1, text: "Implementation plan" }, { text: "Kickoff workshop in Mannheim." }]),
    );
    const image = await w.upload("Logo.png", "image/png", new Uint8Array([137, 80, 78, 71]));
    const deal = await w.createDeal("Mercury", [pdf, docx, image]);
    const other = await w.createDeal("Venus", []);

    expect(await w.index()).toEqual({ extracted: 3, embedded: 0 });
    expect(embedMany).not.toHaveBeenCalled();
    expect(await w.fileRow(pdf)).toMatchObject({ extractionStatus: "done", textTruncated: false, embeddedModel: null });
    expect((await w.fileRow(pdf)).indexedAt).toBeInstanceOf(Date);
    expect(await w.fileRow(image)).toMatchObject({ extractionStatus: "unsupported", extractedText: null });
    expect(await w.index()).toEqual({ extracted: 0, embedded: 0 });

    expect(await w.queryRecords(w.admin, "renews")).toEqual([deal.recordId]);
    expect(await w.queryRecords(w.admin, "Kickoff Mannheim")).toEqual([deal.recordId]);
    expect(await w.queryRecords(w.admin, "renew")).toEqual([deal.recordId]);
    expect(await w.queryRecords(w.admin, "zeppelin")).toEqual([]);
    expect(await w.searchRecords(w.admin, "eleven percent")).toEqual([deal.recordId]);
    expect(await w.searchRecords(w.admin, "eleven percent")).not.toContain(other.recordId);

    const found = await w.searchFiles(w.admin, "subscription renews");
    expect(found.retrieval).toBe("keyword");
    expect(found.items).toHaveLength(1);
    const [hit] = found.items;
    expect(hit).toMatchObject({
      id: pdf,
      name: "Quarterly.pdf",
      mimeType: "application/pdf",
      fieldId: w.files,
      section: "Page 2",
      record: { ref: deal, title: { state: "value", value: { kind: "text", value: "Mercury" } } },
    });
    expect(hit.snippet).toContain("**renews**");

    const content = await w.read(w.admin, pdf);
    if (!content.ok) throw new Error(JSON.stringify(content));
    expect(content.data).toMatchObject({
      id: pdf,
      ref: deal,
      fieldId: w.files,
      extraction: { status: "done", truncated: false },
    });
    const text = content.data.text ?? "";
    expect(text.slice(hit.offset).startsWith("## Page 2")).toBe(true);
    const chunk = boundedRecordFileText({
      text,
      offset: hit.offset,
      maxLength: 5_500,
      render: (value) => value,
      measure: (value) => JSON.stringify(value).length,
    });
    expect(chunk).toMatchObject({ offset: hit.offset, nextOffset: null, totalChars: text.length });
    expect(chunk?.text).toContain("The subscription renews every twelve months unless cancelled.");
    const reader = new ExtractedRecordFileTextReader(new PrismaRecordFileSearchRepo());
    const part = await runWithTenant(w.admin, () => reader.read(pdf, hit.offset));
    expect(part).toEqual({
      offset: hit.offset,
      nextOffset: null,
      totalChars: text.length,
      text: text.slice(hit.offset),
    });
    await expect(runWithTenant(w.admin, () => reader.read(image, 0))).resolves.toBeNull();
    await expect(runWithTenant((await workspace()).admin, () => reader.read(pdf, 0))).resolves.toBeNull();
    await expect(w.read(w.admin, image)).resolves.toMatchObject({
      ok: true,
      data: { extraction: { status: "unsupported" }, text: null },
    });
  });

  it("corrects a misspelled word from readable file text only, without leaking other files", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const secret = await w.upload("Secret.txt", "text/plain", utf8("Project Zebracorn launches in spring."));
    await w.createDeal("Hidden", [secret]);
    await w.index();

    const corrected = await w.searchFiles(w.admin, "zebracron launch");
    expect(corrected.didYouMean).toEqual(["zebracorn launch"]);
    expect(corrected.items.map((item) => item.id)).toEqual([secret]);
    const outsider = await w.searchFiles(w.own, "zebracron launch");
    expect(outsider).toEqual({ items: [], retrieval: "keyword" });
    expect(await w.searchFiles(w.contactsOnly, "zebracorn")).toEqual({ items: [], retrieval: "keyword" });
  });

  it("returns files only on records and fields the reader can see, now", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const assignedFile = await w.upload("Assigned.txt", "text/plain", utf8("Budget approval for the harbour project."));
    const otherFile = await w.upload("Other.txt", "text/plain", utf8("Budget approval for the airport project."));
    const assigned = await w.createDeal("Alpha", [assignedFile]);
    const unassigned = await w.createDeal("Beta", [otherFile]);
    await runWithoutTenant(() =>
      prisma.recordAssignment.create({
        data: { companyId: w.companyId, typeId: w.typeId, recordId: assigned.recordId, userId: w.own.id },
      }),
    );
    await w.index();

    expect((await w.searchFiles(w.admin, "budget approval")).items.map((item) => item.id).sort()).toEqual(
      [assignedFile, otherFile].sort(),
    );
    expect((await w.searchFiles(w.own, "budget approval")).items.map((item) => item.id)).toEqual([assignedFile]);
    expect(await w.searchRecords(w.own, "approval")).toEqual([assigned.recordId]);
    expect(await w.queryRecords(w.own, "approval")).toEqual([assigned.recordId]);
    expect((await w.searchFiles(w.contactsOnly, "budget approval")).items).toEqual([]);
    expect(await w.searchRecords(w.contactsOnly, "approval")).toEqual([]);
    await expect(w.read(w.own, assignedFile)).resolves.toMatchObject({ ok: true });
    expect(JSON.stringify(await w.read(w.own, otherFile))).toContain("permissionDenied");
    expect(JSON.stringify(await w.read(w.contactsOnly, otherFile))).toContain("permissionDenied");

    const foreign = await workspace();
    expect((await foreign.searchFiles(foreign.admin, "budget approval")).items).toEqual([]);
    expect(await foreign.searchRecords(foreign.admin, "approval")).toEqual([]);
    expect(JSON.stringify(await foreign.read(foreign.admin, otherFile))).toContain("recordNotFound");

    await w.mutation({
      action: "update",
      ref: unassigned,
      expectedVersion: await w.version(unassigned),
      fields: [{ fieldId: w.files, value: null }],
    });
    expect(await w.fileRow(otherFile)).toMatchObject({ status: "detached" });
    expect((await w.searchFiles(w.admin, "airport")).items).toEqual([]);
    expect(await w.searchRecords(w.admin, "airport")).toEqual([]);
    expect(JSON.stringify(await w.read(w.admin, otherFile))).toContain("recordNotFound");

    await w.mutation({ action: "delete", ref: assigned, expectedVersion: await w.version(assigned) });
    expect((await w.searchFiles(w.admin, "harbour")).items).toEqual([]);
    expect(await w.searchRecords(w.admin, "harbour")).toEqual([]);
    expect(JSON.stringify(await w.read(w.admin, assignedFile))).toContain("recordNotFound");
  });

  it("hides files in a field the reader may not see on a record they can read", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const file = await w.upload("Notes.txt", "text/plain", utf8("Confidential margin calculation for the tender."));
    const visible = await w.createDeal("Gamma", [file]);
    const hidden = await w.createDeal("Delta", []);
    await runWithoutTenant(() =>
      prisma.recordAssignment.create({
        data: { companyId: w.companyId, typeId: w.typeId, recordId: visible.recordId, userId: w.own.id },
      }),
    );
    await w.index();
    expect((await w.searchFiles(w.own, "margin calculation")).items.map((item) => item.id)).toEqual([file]);
    expect(await w.searchRecords(w.own, "margin")).toEqual([visible.recordId]);

    await runWithoutTenant(() =>
      prisma.recordValueDependency.create({
        data: {
          companyId: w.companyId,
          typeId: w.typeId,
          recordId: visible.recordId,
          fieldId: w.files,
          sourceTypeId: w.typeId,
          sourceId: hidden.recordId,
        },
      }),
    );
    expect(await w.searchFiles(w.own, "margin calculation")).toEqual({ items: [], retrieval: "keyword" });
    expect(await w.searchRecords(w.own, "margin")).toEqual([]);
    expect(await w.queryRecords(w.own, "margin")).toEqual([]);
    expect(JSON.stringify(await w.read(w.own, file))).toContain("permissionDenied");
    expect((await w.searchFiles(w.admin, "margin calculation")).items.map((item) => item.id)).toEqual([file]);
    expect(await w.searchRecords(w.admin, "margin")).toEqual([visible.recordId]);
  });

  it("hides the files of an archived file field", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const contract = await w.upload(
      "Contract.txt",
      "text/plain",
      utf8("Penalty clause for late delivery."),
      w.contract,
    );
    await w.createDeal("Saturn", [contract], w.contract);
    await w.index();
    expect((await w.searchFiles(w.admin, "penalty clause")).items.map((item) => item.id)).toEqual([contract]);

    const model = await runWithTenant(w.admin, () => w.repo.getModel());
    await runWithTenant(w.admin, () =>
      runInTransaction(
        () =>
          w.repo.saveModel(
            {
              ...model,
              revision: model.revision + 1,
              fields: model.fields.map((field) => (field.id === w.contract ? { ...field, archived: true } : field)),
            },
            w.admin.id,
          ),
        { timeout: 30000 },
      ),
    );
    expect((await w.searchFiles(w.admin, "penalty clause")).items).toEqual([]);
    expect(await w.searchRecords(w.admin, "penalty")).toEqual([]);
    expect(JSON.stringify(await w.read(w.admin, contract))).toContain("recordNotFound");
  });

  it("marks broken files failed, gives up after repeated crashes and reuses text of identical bytes", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const broken = await w.upload("Broken.pdf", "application/pdf", utf8("%PDF-1.4 not really"));
    const crashing = await w.upload("Crashing.txt", "text/plain", utf8("Never extracted."));
    const first = await w.upload("First.txt", "text/plain", utf8("Shared onboarding checklist."));
    const copy = await w.upload("Copy.txt", "text/plain", utf8("Shared onboarding checklist."));
    await w.createDeal("Pluto", [broken, crashing, first]);
    await runWithoutTenant(() => prisma.recordFile.update({ where: { id: crashing }, data: { indexAttempts: 3 } }));
    await w.index();
    expect(await w.fileRow(broken)).toMatchObject({ extractionStatus: "failed", extractedText: null });
    expect(await w.fileRow(crashing)).toMatchObject({ extractionStatus: "failed", indexAttempts: 4 });
    expect(await w.fileRow(first)).toMatchObject({ extractionStatus: "done" });

    await runWithoutTenant(() =>
      prisma.recordFileContent.deleteMany({ where: { companyId: w.companyId, fileKey: `${w.companyId}/${copy}` } }),
    );
    await w.createDeal("Charon", [copy]);
    await w.index();
    expect(await w.fileRow(copy)).toMatchObject({
      extractionStatus: "done",
      extractedText: "Shared onboarding checklist.",
    });
    const chunks = await runWithoutTenant(() =>
      prisma.recordFileChunk.findMany({ where: { fileId: copy }, select: { text: true } }),
    );
    expect(chunks).toEqual([{ text: "Copy.txt\n\nShared onboarding checklist." }]);
  });

  it("indexes a file with a huge heading and keeps every stored chunk heading short", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const heading = Array.from({ length: 40_000 }, (_, index) => `term${index}`).join(" ");
    const notes = await w.upload(
      "Notes.md",
      "text/markdown",
      utf8(`# ${heading}\n\n${"Renewal terms for every plan. ".repeat(300)}`),
    );
    await w.createDeal("Huge heading", [notes]);
    await w.index();
    expect(await w.fileRow(notes)).toMatchObject({ extractionStatus: "done" });
    const chunks = await runWithoutTenant(() =>
      prisma.recordFileChunk.findMany({ where: { fileId: notes }, select: { heading: true, text: true } }),
    );
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.heading?.length).toBeLessThanOrEqual(160);
      expect(chunk.text.length).toBeLessThan(2_200);
    }
  });

  it("counts an attempt only for a file whose extraction starts", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const ids = await Promise.all(
      Array.from({ length: 3 }, (_, index) => w.upload(`Attempt ${index}.txt`, "text/plain", utf8(`Attempt ${index}`))),
    );
    await w.createDeal("Attempts", ids);
    const repo = new PrismaRecordFileRepo(w.companyId);
    const claimed = await runWithoutTenant(() => repo.claimPendingFiles(4));
    expect(claimed.map((file) => file.indexAttempts)).toEqual([0, 0, 0]);
    await expect(runWithoutTenant(() => repo.startFileAttempt(ids[0]))).resolves.toBe(1);
    await expect(runWithoutTenant(() => repo.startFileAttempt(ids[0]))).resolves.toBe(2);
    expect(await w.fileRow(ids[1])).toMatchObject({ indexAttempts: 0 });
    await runWithoutTenant(() => repo.storeExtraction(ids[2], { status: "noText" }));
    await expect(runWithoutTenant(() => repo.startFileAttempt(ids[2]))).resolves.toBeNull();
    await expect(
      runWithoutTenant(() => new PrismaRecordFileRepo(randomUUID()).startFileAttempt(ids[1])),
    ).resolves.toBeNull();
  });

  it("gives concurrent indexers different files", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const ids = await Promise.all(
      Array.from({ length: 6 }, (_, index) => w.upload(`Note ${index}.txt`, "text/plain", utf8(`Note ${index}`))),
    );
    await w.createDeal("Many", ids);
    const claim = () => runWithoutTenant(() => new PrismaRecordFileRepo(w.companyId).claimPendingFiles(4));
    const [left, right] = await Promise.all([claim(), claim()]);
    expect(left.length + right.length).toBe(6);
    expect(left.some((file) => right.some((other) => other.id === file.id))).toBe(false);
    await expect(claim()).resolves.toEqual([]);
  });

  it("finds workspaces whose attached files wait too long for extraction", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace();
    const waiting = await w.upload("Waiting.txt", "text/plain", utf8("Waiting"));
    await w.createDeal("Waiting", [waiting]);
    const sweep = (before: Date) =>
      runWithoutTenant(() => new PrismaRecordFileRepo().companiesWithStalledFilesUnscoped(before, 1_000));
    expect(await sweep(new Date(Date.now() - 60_000))).not.toContain(w.companyId);
    expect(await sweep(new Date(Date.now() + 60_000))).toContain(w.companyId);
    await w.index();
    expect(await sweep(new Date(Date.now() + 60_000))).not.toContain(w.companyId);
  });

  it("embeds file chunks with the Knowledge Base model, charges the workspace pool as file indexing and pauses when it is empty", async () => {
    const w = await workspace({ subscription: true });
    const policyFile = await w.upload(
      "Terms.txt",
      "text/plain",
      utf8("Customers get their money back within 30 days."),
    );
    const deal = await w.createDeal("Jupiter", [policyFile]);

    expect(await w.index()).toEqual({ extracted: 1, embedded: 1 });
    expect(embedMany).toHaveBeenCalledTimes(1);
    expect(embedMany.mock.calls[0][0]).toMatchObject({
      model: WIKI_EMBEDDING_MODEL,
      values: ["Terms.txt\n\nCustomers get their money back within 30 days."],
    });
    expect(await w.fileRow(policyFile)).toMatchObject({ embeddedModel: WIKI_EMBEDDING_MODEL });
    const stored = await runWithoutTenant(
      () =>
        prisma.$queryRaw<Array<{ model: string; dims: number }>>`
        SELECT "model", vector_dims("embedding") AS "dims" FROM "RecordFileChunk" WHERE "fileId" = ${policyFile}`,
    );
    expect(stored).toEqual([{ model: WIKI_EMBEDDING_MODEL, dims: WIKI_EMBEDDING_DIMENSIONS }]);
    const usage = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findMany({
        where: { companyId: w.companyId },
        select: { purpose: true, userId: true, state: true, chargedMicrocents: true, model: true },
      }),
    );
    expect(usage).toEqual([
      {
        purpose: "fileIndexing",
        userId: null,
        state: "settled",
        chargedMicrocents: expect.any(BigInt),
        model: WIKI_EMBEDDING_MODEL,
      },
    ]);
    expect(usage[0].chargedMicrocents).toBeGreaterThan(0n);

    const semantic = await w.searchFiles(w.admin, "refund policy", true);
    expect(semantic.retrieval).toBe("semantic");
    expect(semantic.items.map((item) => item.id)).toEqual([policyFile]);
    expect(semantic.items[0].record.ref).toEqual(deal);
    expect(w.schedule).not.toHaveBeenCalled();
    expect((await w.searchFiles(w.admin, "refund policy")).items).toEqual([]);

    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const pool = await runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(w.companyId, new Date()));
    if (!pool) throw new Error("Expected a credit pool");
    expect(pool.limitMicrocents).toBeGreaterThan(CREDIT);
    const now = new Date();
    const blocker = await runWithoutTenant(() =>
      prisma.agentUsageEvent.create({
        data: {
          companyId: w.companyId,
          userId: null,
          state: "settled",
          purpose: "wikiIndexing",
          model: WIKI_EMBEDDING_MODEL,
          costMicrocents: BigInt(pool.limitMicrocents),
          reservedMicrocents: BigInt(pool.limitMicrocents),
          chargedMicrocents: BigInt(pool.limitMicrocents),
          planSnapshot: pool.plan,
          subscriptionStatusSnapshot: pool.subscriptionStatus,
          allowanceMicrocentsSnapshot: BigInt(pool.limitMicrocents),
          periodStart: pool.periodStart,
          periodEnd: pool.periodEnd,
          accrualMonth: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
          settledAt: now,
        },
        select: { id: true },
      }),
    );
    embedMany.mockClear();
    const holiday = await w.upload("Leave.txt", "text/plain", utf8("Vacation requests need two weeks notice."));
    await w.createDeal("Saturn", [holiday]);
    expect(await w.index()).toEqual({ extracted: 1, embedded: 0 });
    expect(embedMany).not.toHaveBeenCalled();
    expect(await w.fileRow(holiday)).toMatchObject({ extractionStatus: "done", embeddedModel: null });
    expect((await w.searchFiles(w.admin, "vacation")).items.map((item) => item.id)).toEqual([holiday]);

    await runWithoutTenant(() => prisma.agentUsageEvent.deleteMany({ where: { id: blocker.id } }));
    w.schedule.mockClear();
    await w.searchFiles(w.admin, "holiday rules", true);
    expect(w.schedule).toHaveBeenCalledTimes(1);
    expect(await w.index()).toEqual({ extracted: 0, embedded: 1 });
    expect(await w.fileRow(holiday)).toMatchObject({ embeddedModel: WIKI_EMBEDDING_MODEL });
    const resumed = await w.searchFiles(w.admin, "holiday rules", true);
    expect(resumed.items.map((item) => item.id)).toEqual([holiday]);
    const purposes = await runWithoutTenant(() =>
      prisma.agentUsageEvent.groupBy({
        by: ["purpose"],
        where: { companyId: w.companyId, state: "settled" },
        _count: { _all: true },
      }),
    );
    expect(Object.fromEntries(purposes.map((row) => [row.purpose, row._count._all]))).toMatchObject({
      fileIndexing: 1,
      wikiRetrieval: 1,
    });
  });

  it("never calls the embedding provider on a self-hosted instance", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const w = await workspace({ subscription: true });
    const file = await w.upload(
      "Handbook.md",
      "text/markdown",
      utf8("# Outage handling\n\nCall the on-call engineer."),
    );
    await w.createDeal("Mars", [file]);

    expect(await w.index()).toEqual({ extracted: 1, embedded: 0 });
    const search = await w.searchFiles(w.admin, "on-call engineer", true);
    expect(search.retrieval).toBe("keyword");
    expect(search.items.map((item) => item.section)).toEqual(["Outage handling"]);
    expect(embedMany).not.toHaveBeenCalled();
    expect(w.schedule).not.toHaveBeenCalled();
    expect(await runWithoutTenant(() => prisma.agentUsageEvent.count({ where: { companyId: w.companyId } }))).toBe(0);
  });
});
