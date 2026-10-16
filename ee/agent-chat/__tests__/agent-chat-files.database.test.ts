import type { RecordField } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { TenantUser } from "@/features/user/user.schema";
import type { InteractorOutcome } from "@/core/validation/validation.utils";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PermissionService } from "@/core/base/permission.service";
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
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { RecordTrashService } = await import("@/features/records/record-trash.service");
const { RecordFileAttachmentService } = await import("@/features/records/record-file-attachment.service");
const { PrismaRecordFileRepo } = await import("@/features/records/prisma-record-file.repository");
const { PrismaFileContentRepo } = await import("@/core/storage/prisma-file-content.repository");
const { DatabaseFileStorageDriver } = await import("@/core/storage/database-file-storage.driver");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { createTestRecordRepo, preloadTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { RecordFileQuotaService } = await import("@/features/record-files/record-file-quota.service");
const { RecordFileUploadService } = await import("@/features/record-files/record-file-upload.service");
const { RecordFileAccessService } = await import("@/features/record-files/record-file-access.service");
const { RecordFileLinks } = await import("@/features/record-files/record-file-links");
const { CreateRecordFileUploadInteractor } = await import(
  "@/features/record-files/create-record-file-upload.interactor"
);
const { UploadRecordFileContentInteractor } = await import(
  "@/features/record-files/upload-record-file-content.interactor"
);
const { GetRecordFileInteractor } = await import("@/features/record-files/get-record-file.interactor");
const { ReadRecordFileInteractor } = await import("@/features/record-files/read-record-file.interactor");
const { AttachRecordFileInteractor } = await import("@/features/record-files/attach-record-file.interactor");
const { PurgeCompanyRecordFilesInteractor } = await import(
  "@/features/record-files/purge-company-record-files.interactor"
);
const { PrismaRecordFileSearchRepo } = await import(
  "@/features/record-file-index/prisma-record-file-search.repository"
);
const { ExtractedRecordFileTextReader } = await import(
  "@/features/record-file-index/extracted-record-file-text-reader"
);
const { RecordFileIndexService } = await import("@/features/record-file-index/record-file-index.service");
const { CreateAgentChatFileUploadInteractor } = await import("../create-agent-chat-file-upload.interactor");
const { CompleteAgentChatFileUploadInteractor } = await import("../complete-agent-chat-file-upload.interactor");
const { AgentChatFileService } = await import("../agent-chat-files.service");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_BYTES = 64 * 1024;

function data<T>(outcome: InteractorOutcome<T>): T {
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.error.issues));
  return outcome.data;
}

function failure(outcome: InteractorOutcome<unknown>) {
  if (outcome.ok) throw new Error("Expected a failure");
  const [issue] = outcome.error.issues;
  const params = issue.code === "custom" ? (issue.params ?? {}) : {};
  return { code: params.error, kind: params.kind };
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function fileField(id: string, typeId: string, position: number) {
  return {
    id,
    typeId,
    label: "Files",
    valueType: "file" as const,
    behavior: { kind: "input" as const },
    required: false,
    multiple: true,
    archived: false,
    publishedSummary: false,
    options: [],
    position,
  } satisfies RecordField;
}

async function workspace() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const reader = await prisma.userRole.create({ data: { companyId: company.id, name: "No access" } });
    const user = (roleId: string) =>
      prisma.user.create({
        data: {
          companyId: company.id,
          roleId,
          firstName: "Test",
          lastName: "User",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      });
    return {
      company,
      role,
      reader,
      admin: await user(role.id),
      colleague: await user(role.id),
      guest: await user(reader.id),
    };
  });
  const companyId = seed.company.id;
  const admin = createMockUser({ ...seed.admin, role: { ...seed.role, permissions: [] } });
  const colleague = createMockUser({ ...seed.colleague, role: { ...seed.role, permissions: [] } });
  const guest = createMockUser({ ...seed.guest, role: { ...seed.reader, permissions: [] } });
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const files = new PrismaRecordFileRepo();
  const driver = new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "http://127.0.0.1:4000", 1024);
  const drivers = () => driver;
  const quotaLimit = { bytesPerUser: null as number | null };
  const quota = new RecordFileQuotaService(
    {
      subscription: () =>
        Promise.resolve({ plan: "enterprise" as const, enterpriseFileStorageBytesPerUser: quotaLimit.bytesPerUser }),
      activeUsers: () => Promise.resolve(1),
      usedBytes: () => files.storageUsageCompanyWide(),
    },
    "cloud",
  );
  const uploads = new RecordFileUploadService(repo, policy, files, quota, { maxBytes: MAX_BYTES, driver: "database" });
  const links = new RecordFileLinks("vitest-secret", "http://127.0.0.1:4000");
  const attacher = new RecordFileAttachmentService(
    files,
    { drivers, maxBytes: MAX_BYTES },
    { dispatch: () => Promise.resolve() },
  );
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo), undefined, attacher),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const access = new RecordFileAccessService(repo, policy, files);
  const get = new GetRecordFileInteractor(access, links);
  const purged: string[] = [];
  const entitlements = { require: () => Promise.resolve(null) };
  const extraction = (scoped: string) =>
    new RecordFileIndexService(new PrismaRecordFileRepo(scoped), () => driver, {
      embedPending: () => Promise.resolve({ embedded: 0, remaining: false }),
    });
  const chatFiles = new AgentChatFileService(access, files, {
    dispatch: (_name: string, payload: { companyId: string }) => {
      purged.push(payload.companyId);
      return Promise.resolve();
    },
  } as never);
  const interactors = {
    createChat: new CreateAgentChatFileUploadInteractor(entitlements as never, uploads, drivers, links),
    complete: new CompleteAgentChatFileUploadInteractor(entitlements as never, files, drivers, extraction, MAX_BYTES),
    createField: new CreateRecordFileUploadInteractor(uploads, drivers, links),
    put: new UploadRecordFileContentInteractor(files, drivers),
    get,
    read: new ReadRecordFileInteractor(get, new ExtractedRecordFileTextReader(new PrismaRecordFileSearchRepo())),
    attach: new AttachRecordFileInteractor(files, access, { records: repo, mutate }),
    purge: new PurgeCompanyRecordFilesInteractor(
      () => new PrismaRecordFileRepo(companyId),
      () => () => new DatabaseFileStorageDriver(new PrismaFileContentRepo(companyId), "http://127.0.0.1:4000", 1024),
    ),
  };
  const typeId = presetId(companyId, "deal");
  const fieldId = presetId(companyId, "deal.files");
  const model = createCrmPreset(companyId);
  model.fields.push(fileField(fieldId, typeId, Math.max(...model.fields.map((field) => field.position)) + 1));
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const as = <T>(user: TenantUser, fn: () => Promise<T>) => runWithTenant(user, fn);
  const revision = async () =>
    (await runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } }))).revision;
  const mutation = async (value: RecordMutation, user: TenantUser = admin) =>
    as(user, async () =>
      mutate.invoke({ mutation: value, expectedRevision: await revision(), idempotencyKey: randomUUID() }),
    );
  const createDeal = async () => {
    const result = data(
      await mutation({
        action: "create",
        typeId,
        fields: [{ fieldId: presetId(companyId, "deal.name"), value: { kind: "text", value: "Deal" } }],
      }),
    );
    if (result.status !== "completed") throw new Error("Expected a completed write");
    return { typeId, recordId: result.refs[0].recordId };
  };
  const version = async (ref: { typeId: string; recordId: string }) =>
    (await as(admin, () => repo.getRecordCompanyWide(ref)))?.version ?? 0;
  const listed = async (ref: { typeId: string; recordId: string }) => {
    const record = await as(admin, () => repo.getRecordCompanyWide(ref));
    const value = record?.values.find((candidate) => candidate.fieldId === fieldId);
    return value?.state === "value" ? value.textListValue : [];
  };
  const chatFile = async (text = "Offer total: 4,200 EUR net.", user: TenantUser = admin, name = "Offer.txt") => {
    const started = data(
      await as(user, () =>
        interactors.createChat.invoke({
          name,
          size: new TextEncoder().encode(text).byteLength,
          mimeType: "text/plain",
        }),
      ),
    );
    data(await as(user, () => interactors.put.invoke({ fileId: started.fileId, body: streamOf(text) })));
    data(await as(user, () => interactors.complete.invoke({ fileId: started.fileId })));
    return started.fileId;
  };
  const conversation = (user: TenantUser = admin) =>
    runWithoutTenant(() =>
      prisma.agentConversation.create({ data: { companyId, userId: user.id, title: "Files" }, select: { id: true } }),
    ).then((row) => row.id);
  const row = (fileId: string) => runWithoutTenant(() => prisma.recordFile.findUnique({ where: { id: fileId } }));
  const parts = (storageKey: string) =>
    runWithoutTenant(() => prisma.recordFileContent.count({ where: { fileKey: storageKey } }));
  const purge = (now: Date) => interactors.purge.invoke({ companyId, now: now.toISOString(), detachOrphans: true });
  return {
    companyId,
    typeId,
    fieldId,
    admin,
    colleague,
    guest,
    quotaLimit,
    interactors,
    chatFiles,
    purged,
    as,
    mutation,
    createDeal,
    version,
    listed,
    chatFile,
    conversation,
    row,
    parts,
    purge,
  };
}

describeDatabase("files given to Mate in a chat", () => {
  beforeAll(() => preloadTestRecordRepo(), 120_000);

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("stores a chat file outside any field, reads its text when the upload completes and shows it only to its uploader", async () => {
    const w = await workspace();
    const started = data(
      await w.as(w.admin, () =>
        w.interactors.createChat.invoke({ name: "../Notes.txt", size: 27, mimeType: "text/plain" }),
      ),
    );
    expect(new URL(started.upload.url).pathname).toBe(`/api/v1/files/${started.fileId}/content`);
    expect(await w.row(started.fileId)).toMatchObject({
      typeId: null,
      fieldId: null,
      recordId: null,
      conversationId: null,
      name: "Notes.txt",
      status: "pending",
      uploadedById: w.admin.id,
      extractionStatus: "pending",
    });
    expect(failure(await w.as(w.admin, () => w.interactors.complete.invoke({ fileId: started.fileId })))).toMatchObject(
      {
        code: "recordFileUploadIncomplete",
      },
    );

    const fileId = started.fileId;
    data(
      await w.as(w.admin, () => w.interactors.put.invoke({ fileId, body: streamOf("Offer total: 4,200 EUR net.") })),
    );
    const completed = data(await w.as(w.admin, () => w.interactors.complete.invoke({ fileId })));
    expect(completed).toMatchObject({
      id: fileId,
      typeId: null,
      fieldId: null,
      status: "pending",
      extractionStatus: "done",
    });

    const read = data(await w.as(w.admin, () => w.interactors.read.invoke({ fileId, offset: 0 })));
    expect(read).toMatchObject({ textAvailable: true, offset: 0 });
    expect(read.text).toContain("4,200 EUR");

    for (const outsider of [w.colleague, w.guest]) {
      expect(failure(await w.as(outsider, () => w.interactors.get.invoke({ fileId })))).toMatchObject({
        code: "recordFileNotFound",
      });
      expect(failure(await w.as(outsider, () => w.interactors.complete.invoke({ fileId })))).toMatchObject({
        code: "recordFileNotFound",
      });
      const deal = await w.createDeal();
      expect(
        failure(
          await w.as(outsider, () =>
            w.interactors.attach.invoke({ fileId, typeId: deal.typeId, recordId: deal.recordId, fieldId: w.fieldId }),
          ),
        ),
      ).toMatchObject({ code: "recordFileNotFound" });
    }
  });

  it("refuses chat files above the size limit or the workspace storage and counts them as storage", async () => {
    const w = await workspace();
    expect(
      failure(
        await w.as(w.admin, () =>
          w.interactors.createChat.invoke({ name: "Huge.pdf", size: MAX_BYTES + 1, mimeType: "application/pdf" }),
        ),
      ),
    ).toMatchObject({ code: "recordFileTooLarge" });

    const fileId = await w.chatFile("x".repeat(4_000));
    expect(Number((await w.row(fileId))?.size)).toBe(4_000);
    w.quotaLimit.bytesPerUser = 4_100;
    expect(
      failure(
        await w.as(w.admin, () =>
          w.interactors.createChat.invoke({ name: "More.txt", size: 200, mimeType: "text/plain" }),
        ),
      ),
    ).toMatchObject({ code: "storageQuotaExceeded" });
    w.quotaLimit.bytesPerUser = null;
  });

  it("files a chat file onto a record through a record update, after which the record's access rules apply", async () => {
    const w = await workspace();
    const deal = await w.createDeal();
    const other = await w.createDeal();
    const fileId = await w.chatFile();
    const target = { typeId: deal.typeId, recordId: deal.recordId, fieldId: w.fieldId };

    const stale = (await w.version(deal)) + 1;
    expect(
      failure(await w.as(w.admin, () => w.interactors.attach.invoke({ fileId, ...target, expectedVersion: stale })))
        .code,
    ).toBe("recordVersionChanged");
    expect(await w.row(fileId)).toMatchObject({ typeId: null, fieldId: null, status: "pending" });
    expect(failure(await w.as(w.guest, () => w.interactors.attach.invoke({ fileId, ...target }))).code).toBe(
      "recordFileNotFound",
    );

    const attached = data(
      await w.as(w.admin, () => w.interactors.attach.invoke({ fileId, ...target, mode: "append" })),
    );
    expect(attached).toMatchObject({
      attached: true,
      file: { id: fileId, typeId: deal.typeId, fieldId: w.fieldId, recordId: deal.recordId, status: "ready" },
    });
    expect(await w.listed(deal)).toEqual([fileId]);
    const versionAfter = await w.version(deal);
    expect(data(await w.as(w.admin, () => w.interactors.attach.invoke({ fileId, ...target })))).toMatchObject({
      attached: true,
    });
    expect(await w.version(deal)).toBe(versionAfter);
    expect(
      failure(
        await w.as(w.admin, () =>
          w.interactors.attach.invoke({ fileId, typeId: other.typeId, recordId: other.recordId, fieldId: w.fieldId }),
        ),
      ).code,
    ).toBe("recordFileUnavailable");

    expect(data(await w.as(w.colleague, () => w.interactors.get.invoke({ fileId })))).toMatchObject({
      status: "ready",
    });
    expect(failure(await w.as(w.guest, () => w.interactors.get.invoke({ fileId }))).kind).toBe("authorization");

    const second = await w.chatFile("Second offer");
    const updated = await w.mutation({
      action: "update",
      ref: deal,
      expectedVersion: await w.version(deal),
      fields: [{ fieldId: w.fieldId, value: { kind: "file", value: [fileId, second] } }],
    });
    expect(updated.ok).toBe(true);
    expect(await w.listed(deal)).toEqual([fileId, second]);
    const foreign = await w.chatFile("Colleague's notes", w.colleague);
    const refused = await w.mutation({
      action: "update",
      ref: other,
      expectedVersion: await w.version(other),
      fields: [{ fieldId: w.fieldId, value: { kind: "file", value: [foreign] } }],
    });
    expect(failure(refused).code).toBe("recordFileUnavailable");
    expect(await w.row(foreign)).toMatchObject({ typeId: null, status: "pending" });
  });

  it("refuses to attach a pending upload of one file field to another field", async () => {
    const w = await workspace();
    const deal = await w.createDeal();
    const started = data(
      await w.as(w.admin, () =>
        w.interactors.createField.invoke({
          typeId: w.typeId,
          fieldId: presetId(w.companyId, "deal.files"),
          name: "Upload.txt",
          size: 5,
          mimeType: "text/plain",
        }),
      ),
    );
    data(await w.as(w.admin, () => w.interactors.put.invoke({ fileId: started.fileId, body: streamOf("Hello") })));
    const attached = data(
      await w.as(w.admin, () =>
        w.interactors.attach.invoke({
          fileId: started.fileId,
          typeId: deal.typeId,
          recordId: deal.recordId,
          fieldId: w.fieldId,
        }),
      ),
    );
    expect(attached).toMatchObject({ attached: true, file: { status: "ready", recordId: deal.recordId } });
    const unknownField = randomUUID();
    const chat = await w.chatFile();
    expect(
      failure(
        await w.as(w.admin, () =>
          w.interactors.attach.invoke({
            fileId: chat,
            typeId: deal.typeId,
            recordId: deal.recordId,
            fieldId: unknownField,
          }),
        ),
      ).code,
    ).toBe("recordValueInvalid");
    expect(await w.row(chat)).toMatchObject({ fieldId: null, status: "pending" });
  });

  it("accepts for a Mate message only the uploader's completed chat files of that chat", async () => {
    const w = await workspace();
    const chatA = await w.conversation();
    const chatB = await w.conversation();
    const fileId = await w.chatFile();
    const context = (id: string) => ({
      reference: { kind: "file" as const, fileId: id, mimeType: "text/plain", size: 1 },
      label: "Offer.txt",
    });

    expect(data(await w.as(w.admin, () => w.chatFiles.resolve([context(fileId)], null)))).toMatchObject([
      { id: fileId, name: "Offer.txt", mimeType: "text/plain", extractionStatus: "done", pageCount: null },
    ]);
    await w.as(w.admin, () => w.chatFiles.bind(chatA, [fileId]));
    expect((await w.row(fileId))?.conversationId).toBe(chatA);
    expect(data(await w.as(w.admin, () => w.chatFiles.resolve([context(fileId)], chatA)))).toHaveLength(1);
    expect((await w.as(w.admin, () => w.chatFiles.resolve([context(fileId)], chatB))).ok).toBe(false);
    expect((await w.as(w.admin, () => w.chatFiles.resolve([context(fileId)], null))).ok).toBe(false);
    await w.as(w.admin, () => w.chatFiles.bind(chatB, [fileId]));
    expect((await w.row(fileId))?.conversationId).toBe(chatA);

    const started = data(
      await w.as(w.admin, () => w.interactors.createChat.invoke({ name: "Open.txt", size: 4, mimeType: "text/plain" })),
    );
    expect((await w.as(w.admin, () => w.chatFiles.resolve([context(started.fileId)], chatA))).ok).toBe(false);
    const foreign = await w.chatFile("Theirs", w.colleague);
    expect((await w.as(w.admin, () => w.chatFiles.resolve([context(foreign)], chatA))).ok).toBe(false);
    await w.as(w.admin, () => w.chatFiles.bind(chatA, [foreign]));
    expect((await w.row(foreign))?.conversationId).toBeNull();

    const deal = await w.createDeal();
    data(
      await w.as(w.admin, () =>
        w.interactors.attach.invoke({ fileId, typeId: deal.typeId, recordId: deal.recordId, fieldId: w.fieldId }),
      ),
    );
    expect(data(await w.as(w.admin, () => w.chatFiles.resolve([context(fileId)], chatB)))).toHaveLength(1);
  });

  it("deletes unsent chat files after a day, sent ones after thirty days or with their chat, and never filed ones", async () => {
    const w = await workspace();
    const kept = await w.conversation();
    const deleted = await w.conversation();
    const unsent = await w.chatFile("unsent");
    const sent = await w.chatFile("sent");
    const filed = await w.chatFile("filed");
    const withChat = await w.chatFile("with chat");
    await w.as(w.admin, () => w.chatFiles.bind(kept, [sent, filed]));
    await w.as(w.admin, () => w.chatFiles.bind(deleted, [withChat]));
    const deal = await w.createDeal();
    data(
      await w.as(w.admin, () =>
        w.interactors.attach.invoke({
          fileId: filed,
          typeId: deal.typeId,
          recordId: deal.recordId,
          fieldId: w.fieldId,
        }),
      ),
    );
    const keys = Object.fromEntries(
      await Promise.all(
        [unsent, sent, filed, withChat].map(async (id) => [id, (await w.row(id))?.storageKey ?? ""] as const),
      ),
    );

    await runWithoutTenant(() => prisma.agentConversation.delete({ where: { id: deleted } }));
    await w.as(w.admin, () => w.chatFiles.expireConversation(deleted));
    expect(w.purged).toEqual([w.companyId]);
    expect(await w.row(withChat)).toMatchObject({ status: "detached" });
    expect(failure(await w.as(w.admin, () => w.interactors.get.invoke({ fileId: withChat }))).code).toBe(
      "recordFileNotFound",
    );

    await w.purge(new Date(Date.now() + 25 * HOUR));
    expect(await w.row(unsent)).toBeNull();
    expect(await w.parts(keys[unsent])).toBe(0);
    expect(await w.row(withChat)).toBeNull();
    expect(await w.parts(keys[withChat])).toBe(0);
    expect(await w.row(sent)).toMatchObject({ status: "pending" });
    expect(await w.row(filed)).toMatchObject({ status: "ready" });

    await w.purge(new Date(Date.now() + 31 * DAY));
    expect(await w.row(sent)).toBeNull();
    expect(await w.parts(keys[sent])).toBe(0);
    expect(await w.row(filed)).toMatchObject({ status: "ready" });
    expect(await w.parts(keys[filed])).toBeGreaterThan(0);
  });
});
