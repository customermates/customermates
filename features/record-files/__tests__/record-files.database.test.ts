import type { RecordMutation } from "@/features/records/record-query.schema";
import type { RecordField } from "@/features/records/record-model.schema";
import type { TenantUser } from "@/features/user/user.schema";
import type { InteractorOutcome } from "@/core/validation/validation.utils";

import { createHash, randomBytes, randomUUID } from "node:crypto";
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
const { RecordFileQuotaService } = await import("../record-file-quota.service");
const { RecordFileUploadService } = await import("../record-file-upload.service");
const { RecordFileAccessService } = await import("../record-file-access.service");
const { RecordFileLinks } = await import("../record-file-links");
const { RecordFileGrantTenant } = await import("../record-file-grant-tenant");
const { CreateRecordFileUploadInteractor } = await import("../create-record-file-upload.interactor");
const { UploadRecordFileContentInteractor } = await import("../upload-record-file-content.interactor");
const { UploadRecordFileContentByGrantInteractor } = await import("../upload-record-file-content-by-grant.interactor");
const { GetRecordFileInteractor } = await import("../get-record-file.interactor");
const { DownloadRecordFileInteractor } = await import("../download-record-file.interactor");
const { DownloadRecordFileByGrantInteractor } = await import("../download-record-file-by-grant.interactor");
const { UploadRecordFileInteractor } = await import("../upload-record-file.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

function fileField(id: string, typeId: string, label: string, position: number, multiple: boolean) {
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

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function bytesOf(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (!stream) throw new Error("Expected a body");
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function data<T>(outcome: InteractorOutcome<T>): T {
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.error.issues));
  return outcome.data;
}

function failure(outcome: InteractorOutcome<unknown>) {
  if (outcome.ok) throw new Error("Expected a failure");
  const [issue] = outcome.error.issues;
  const params = issue.code === "custom" ? (issue.params ?? {}) : {};
  return { code: params.error, kind: params.kind, message: issue.message, path: issue.path };
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
  const users = new Map([admin, colleague, guest].map((user) => [user.id, user]));
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const files = new PrismaRecordFileRepo();
  const driver = new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "http://127.0.0.1:4000", 1024);
  const drivers = () => driver;
  const indexed: Array<{ companyId: string; fileIds: string[] }> = [];
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
  const uploads = new RecordFileUploadService(repo, policy, files, quota, { maxBytes: 64 * 1024, driver: "database" });
  const links = new RecordFileLinks("vitest-secret", "http://127.0.0.1:4000");
  const grants = new RecordFileGrantTenant(links, {
    getActiveUserByIdOrThrow: (userId: string) => {
      const user = users.get(userId);
      return user ? Promise.resolve(user) : Promise.reject(new Error("User not found"));
    },
  });
  const calculations = new RecordCalculationService(repo);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(
      repo,
      policy,
      calculations,
      undefined,
      new RecordFileAttachmentService(
        files,
        { drivers, maxBytes: 64 * 1024 },
        {
          dispatch: (request) => {
            indexed.push(request);
            return Promise.resolve();
          },
        },
      ),
    ),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const access = new RecordFileAccessService(repo, policy, files);
  const content = new DownloadRecordFileInteractor(access, drivers);
  const putContent = new UploadRecordFileContentInteractor(files, drivers);
  const interactors = {
    create: new CreateRecordFileUploadInteractor(uploads, drivers, links),
    put: putContent,
    putByGrant: new UploadRecordFileContentByGrantInteractor(grants, putContent),
    get: new GetRecordFileInteractor(access, links),
    read: content,
    readByGrant: new DownloadRecordFileByGrantInteractor(grants, content),
    upload: new UploadRecordFileInteractor(uploads, files, drivers, repo, mutate),
  };
  const id = (key: string) => presetId(companyId, key);
  const typeId = id("deal");
  const multiple = id("deal.files");
  const single = id("deal.contract");
  const model = createCrmPreset(companyId);
  const position = Math.max(...model.fields.map((field) => field.position)) + 1;
  model.fields.push(
    fileField(multiple, typeId, "Files", position, true),
    fileField(single, typeId, "Contract", position + 1, false),
  );
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const as = <T>(user: TenantUser, fn: () => Promise<T>) => runWithTenant(user, fn);
  const revision = async () =>
    (await runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } }))).revision;
  const mutation = async (value: RecordMutation, user: TenantUser = admin) =>
    as(user, async () =>
      mutate.invoke({ mutation: value, expectedRevision: await revision(), idempotencyKey: randomUUID() }),
    );
  const version = async (ref: { typeId: string; recordId: string }) =>
    (await as(admin, () => repo.getRecordCompanyWide(ref)))?.version ?? 0;
  const createDeal = async (fields: Extract<RecordMutation, { action: "create" }>["fields"] = []) => {
    const result = data(
      await mutation({
        action: "create",
        typeId,
        fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: "Deal" } }, ...fields],
      }),
    );
    if (result.status !== "completed") throw new Error("Expected a completed write");
    return { typeId, recordId: result.refs[0].recordId };
  };
  const setFiles = async (ref: { typeId: string; recordId: string }, fieldId: string, ids: string[]) =>
    mutation({
      action: "update",
      ref,
      expectedVersion: await version(ref),
      fields: [{ fieldId, value: ids.length ? { kind: "file", value: ids } : null }],
    });
  const uploaded = async (size: number, fieldId = multiple, name = "Offer.pdf", user: TenantUser = admin) => {
    const bytes = new Uint8Array(randomBytes(size));
    const started = data(
      await as(user, () => interactors.create.invoke({ typeId, fieldId, name, size, mimeType: "application/pdf" })),
    );
    data(await as(user, () => interactors.put.invoke({ fileId: started.fileId, body: streamOf(bytes) })));
    return { fileId: started.fileId, bytes, upload: started.upload };
  };
  const row = (fileId: string) => runWithoutTenant(() => prisma.recordFile.findUnique({ where: { id: fileId } }));
  const parts = (fileId: string) =>
    runWithoutTenant(async () => {
      const file = await prisma.recordFile.findUnique({ where: { id: fileId } });
      return file ? prisma.recordFileContent.count({ where: { fileKey: file.storageKey } }) : 0;
    });
  return {
    companyId,
    typeId,
    multiple,
    single,
    admin,
    colleague,
    guest,
    quotaLimit,
    indexed,
    interactors,
    as,
    mutation,
    version,
    createDeal,
    setFiles,
    uploaded,
    row,
    parts,
    repo,
  };
}

describeDatabase("record files", () => {
  beforeAll(() => preloadTestRecordRepo(), 120_000);

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("uploads through the content route, attaches the file and serves it whole, by range and by signed link", async () => {
    const w = await workspace();
    const bytes = new Uint8Array(randomBytes(3000));
    const started = data(
      await w.as(w.admin, () =>
        w.interactors.create.invoke({
          typeId: w.typeId,
          fieldId: w.multiple,
          name: "../Angebot Müller.pdf",
          size: bytes.byteLength,
          mimeType: "Application/PDF",
        }),
      ),
    );
    const uploadUrl = new URL(started.upload.url);
    expect(uploadUrl.origin + uploadUrl.pathname).toBe(`http://127.0.0.1:4000/api/v1/files/${started.fileId}/content`);
    expect(uploadUrl.searchParams.get("token")).toMatch(/^\d+\.[0-9a-f-]{36}\.[0-9a-f]{64}$/);
    expect(started.upload).toMatchObject({ method: "PUT", headers: { "Content-Type": "application/pdf" } });
    expect(await w.row(started.fileId)).toMatchObject({
      name: "Angebot Müller.pdf",
      mimeType: "application/pdf",
      status: "pending",
      storageDriver: "database",
      uploadedById: w.admin.id,
    });

    const early = await w.createDeal().then((ref) => w.setFiles(ref, w.multiple, [started.fileId]));
    expect(failure(early).code).toBe("recordFileUnavailable");

    const token = uploadUrl.searchParams.get("token") ?? "";
    const stored = data(
      await w.interactors.putByGrant.invoke({ fileId: started.fileId, token, body: streamOf(bytes) }),
    );
    expect(stored).toEqual({
      fileId: started.fileId,
      size: 3000,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });

    const ref = await w.createDeal([{ fieldId: w.multiple, value: { kind: "file", value: [started.fileId] } }]);
    expect(await w.row(started.fileId)).toMatchObject({ status: "ready", recordId: ref.recordId });
    expect(w.indexed).toEqual([{ companyId: w.companyId, fileIds: [started.fileId] }]);

    const details = data(await w.as(w.colleague, () => w.interactors.get.invoke({ fileId: started.fileId })));
    expect(details).toMatchObject({
      id: started.fileId,
      typeId: w.typeId,
      fieldId: w.multiple,
      recordId: ref.recordId,
      name: "Angebot Müller.pdf",
      size: 3000,
      status: "ready",
      uploadedById: w.admin.id,
      extractionStatus: "pending",
    });
    expect(Date.parse(details.downloadUrlExpiresAt) - Date.now()).toBeGreaterThan(14 * 60 * 1000);

    const whole = data(await w.as(w.colleague, () => w.interactors.read.invoke({ fileId: started.fileId })));
    expect(whole.status).toBe(200);
    expect(whole.headers).toMatchObject({
      "content-type": "application/pdf",
      "content-length": "3000",
      "content-disposition": "inline; filename=\"Angebot M_ller.pdf\"; filename*=UTF-8''Angebot%20M%C3%BCller.pdf",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "content-security-policy": "sandbox; frame-ancestors 'self'",
    });
    expect(await bytesOf(whole.body)).toEqual(bytes);

    const range = data(
      await w.as(w.admin, () => w.interactors.read.invoke({ fileId: started.fileId, range: "bytes=1500-2047" })),
    );
    expect(range.status).toBe(206);
    expect(range.headers["content-range"]).toBe("bytes 1500-2047/3000");
    expect(await bytesOf(range.body)).toEqual(bytes.subarray(1500, 2048));
    const beyond = data(
      await w.as(w.admin, () => w.interactors.read.invoke({ fileId: started.fileId, range: "bytes=3000-" })),
    );
    expect(beyond).toMatchObject({ status: 416, headers: { "content-range": "bytes */3000" }, body: null });
    const attachment = data(
      await w.as(w.admin, () => w.interactors.read.invoke({ fileId: started.fileId, download: true })),
    );
    expect(attachment.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(attachment.headers["content-security-policy"]).toBe("frame-ancestors 'self'");
    await attachment.body?.cancel();

    const signed = new URL(details.downloadUrl).searchParams.get("token") ?? "";
    const linked = data(await w.interactors.readByGrant.invoke({ fileId: started.fileId, token: signed }));
    expect(await bytesOf(linked.body)).toEqual(bytes);
    const other = await w.uploaded(10);
    for (const attempt of [
      { fileId: other.fileId, token: signed },
      { fileId: started.fileId, token: `${signed.slice(0, -1)}0` },
      { fileId: started.fileId, token },
    ]) {
      expect(failure(await w.interactors.readByGrant.invoke(attempt))).toMatchObject({
        code: "recordFileLinkInvalid",
      });
    }
  });

  it("refuses incomplete uploads, keeps pending files to their uploader and hides files from other workspaces", async () => {
    const w = await workspace();
    const stranger = await workspace();
    const started = data(
      await w.as(w.admin, () =>
        w.interactors.create.invoke({ typeId: w.typeId, fieldId: w.multiple, name: "a.txt", size: 100, mimeType: "" }),
      ),
    );
    expect(await w.row(started.fileId)).toMatchObject({ mimeType: "application/octet-stream" });
    for (const size of [50, 150]) {
      const refused = await w.as(w.admin, () =>
        w.interactors.put.invoke({ fileId: started.fileId, body: streamOf(new Uint8Array(size)) }),
      );
      expect(failure(refused)).toMatchObject({ code: "recordFileUploadIncomplete" });
      expect(await w.parts(started.fileId)).toBe(0);
    }
    for (const user of [w.colleague, stranger.admin]) {
      expect(failure(await w.as(user, () => w.interactors.get.invoke({ fileId: started.fileId })))).toMatchObject({
        code: "recordFileNotFound",
        kind: "not_found",
      });
      expect(
        failure(
          await w.as(user, () =>
            w.interactors.put.invoke({ fileId: started.fileId, body: streamOf(new Uint8Array(100)) }),
          ),
        ),
      ).toMatchObject({ code: "recordFileNotFound" });
    }
    expect(data(await w.as(w.admin, () => w.interactors.get.invoke({ fileId: started.fileId }))).status).toBe(
      "pending",
    );

    const attached = await w.uploaded(64);
    await w.createDeal([{ fieldId: w.multiple, value: { kind: "file", value: [attached.fileId] } }]);
    expect(
      failure(await stranger.as(stranger.admin, () => stranger.interactors.read.invoke({ fileId: attached.fileId }))),
    ).toMatchObject({ code: "recordFileNotFound", kind: "not_found" });
    expect(failure(await w.as(w.guest, () => w.interactors.get.invoke({ fileId: attached.fileId })))).toMatchObject({
      code: "permissionDenied",
      kind: "authorization",
    });
    expect(
      failure(
        await w.as(w.guest, () =>
          w.interactors.create.invoke({ typeId: w.typeId, fieldId: w.multiple, name: "x.pdf", size: 1, mimeType: "" }),
        ),
      ),
    ).toMatchObject({ code: "permissionDenied" });
  });

  it("validates the field, the name, the size limit and the workspace storage", async () => {
    const w = await workspace();
    const start = (input: Partial<{ fieldId: string; name: string; size: number }>) =>
      w.as(w.admin, () =>
        w.interactors.create.invoke({
          typeId: w.typeId,
          fieldId: w.multiple,
          name: "file.pdf",
          size: 10,
          mimeType: "application/pdf",
          ...input,
        }),
      );
    expect(failure(await start({ fieldId: presetIdOf(w.companyId, "deal.name") }))).toMatchObject({
      code: "recordValueInvalid",
      path: ["fieldId"],
    });
    expect(failure(await start({ name: "folder/\u0000/" }))).toMatchObject({ code: "recordFileNameInvalid" });
    expect(failure(await start({ size: 64 * 1024 + 1 }))).toMatchObject({
      code: "recordFileTooLarge",
      message: "recordFileTooLarge",
    });

    w.quotaLimit.bytesPerUser = 4000;
    await w.uploaded(3000);
    const refused = await start({ size: 1001 });
    expect(failure(refused)).toMatchObject({ code: "storageQuotaExceeded", kind: "conflict" });
    expect(data(await start({ size: 1000 })).fileId).toBeTruthy();
  });

  it("refuses a file that is already attached to another record", async () => {
    const w = await workspace();
    const file = await w.uploaded(32);
    await w.createDeal([{ fieldId: w.multiple, value: { kind: "file", value: [file.fileId] } }]);
    const second = await w.createDeal();
    expect(failure(await w.setFiles(second, w.multiple, [file.fileId])).code).toBe("recordFileUnavailable");
    expect(failure(await w.setFiles(second, w.single, [file.fileId])).code).toBe("recordFileUnavailable");
  });

  it("uploads base64 content and attaches it to a record in one call", async () => {
    const w = await workspace();
    const ref = await w.createDeal();
    const first = data(
      await w.as(w.admin, () =>
        w.interactors.upload.invoke({
          typeId: w.typeId,
          fieldId: w.multiple,
          name: "notes.txt",
          mimeType: "text/plain",
          content: Buffer.from("first").toString("base64"),
          recordId: ref.recordId,
        }),
      ),
    );
    expect(first).toMatchObject({ attached: true, file: { name: "notes.txt", size: 5, status: "ready" } });
    const second = data(
      await w.as(w.admin, () =>
        w.interactors.upload.invoke({
          typeId: w.typeId,
          fieldId: w.multiple,
          name: "more.txt",
          mimeType: "text/plain",
          content: `data:text/plain;base64,${Buffer.from("second").toString("base64")}`,
          recordId: ref.recordId,
        }),
      ),
    );
    const stored = await w.as(w.admin, () => w.repo.getRecordCompanyWide(ref));
    expect(stored?.values.find((value) => value.fieldId === w.multiple)?.textListValue).toEqual([
      first.file.id,
      second.file.id,
    ]);
    const loose = data(
      await w.as(w.admin, () =>
        w.interactors.upload.invoke({
          typeId: w.typeId,
          fieldId: w.single,
          name: "loose.txt",
          mimeType: "text/plain",
          content: Buffer.from("loose").toString("base64"),
        }),
      ),
    );
    expect(loose).toMatchObject({ attached: false, file: { status: "pending", recordId: null } });
    expect(
      failure(
        await w.as(w.admin, () =>
          w.interactors.upload.invoke({
            typeId: w.typeId,
            fieldId: w.single,
            name: "bad.txt",
            mimeType: "text/plain",
            content: "not base64!",
          }),
        ),
      ).code,
    ).toBe("recordFileContentInvalid");
  });
});

function presetIdOf(companyId: string, key: string) {
  return presetId(companyId, key);
}
