import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";
import type { TenantUser } from "@/features/user/user.schema";
import type { MessagingService } from "../../messaging.service";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { PermissionService } from "@/core/base/permission.service";
import { DatabaseFileStorageDriver } from "@/core/storage/database-file-storage.driver";
import { PrismaFileContentRepo } from "@/core/storage/prisma-file-content.repository";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";
import { createMockUser } from "@/tests/helpers/mock-user";
import { createTestRecordRepo } from "@/tests/helpers/record-repository";
import { RecordFileAccessService } from "@/features/record-files/record-file-access.service";
import { UploadRecordFileContentInteractor } from "@/features/record-files/upload-record-file-content.interactor";
import { RecordAccessPolicy } from "@/features/records/record-access";
import { PrismaRecordFileRepo } from "@/features/records/prisma-record-file.repository";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { PrismaConnectedAccountRepo } from "../../persistence/prisma-connected-account.repository";
import { PrismaUnipileWebhookRepo } from "../../persistence/prisma-unipile-webhook.repository";
import { SaveDraftInteractor, type SaveDraftData } from "../save-draft.interactor";
import { DraftSendGate } from "../draft-send-gate";
import { DiscardDraftInteractor } from "../discard-draft.interactor";
import { EmailFileAttachments } from "../email-file-attachments";
import { SendEmailInteractor, type SendEmailData } from "../send-email.interactor";

vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Failure = { ok: false; error: { issues: Array<{ params?: { error?: string; kind?: string } }> } };

function failureParams(result: unknown) {
  return (result as Failure).error.issues[0]?.params;
}

function providerStub() {
  return {
    sendEmail: vi.fn().mockResolvedValue({
      ok: true,
      data: { id: `unipile-${randomUUID()}`, messageId: `<${randomUUID()}@example.invalid>` },
    }),
    getEmail: vi.fn().mockRejectedValue(new Error("not indexed yet")),
  };
}

describeDatabase("sending an email draft after editing it", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const accountId = randomUUID();
  const ownerEmail = `draft-editor-${ownerId}@example.invalid`;
  const tenant = createMockUser({ id: ownerId, companyId, email: ownerEmail }) satisfies TenantUser;
  const address = (label: string) => `${label}-${randomUUID()}@example.invalid`;

  const accounts = () =>
    new PrismaConnectedAccountRepo(
      new PermissionService(),
      new PrismaUnipileWebhookRepo(),
      new PrismaBillingUsageRepo(),
    );
  const emailFiles = () => {
    const records = createTestRecordRepo();
    const files = new PrismaRecordFileRepo();
    const policy = new RecordAccessPolicy(
      new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo()),
      records,
    );
    return new EmailFileAttachments(
      createTestMessagingRepo(),
      new RecordFileAccessService(records, policy, files),
      () => new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "http://127.0.0.1:4000"),
      files,
    );
  };
  const save = (data: SaveDraftData) =>
    runWithTenant(tenant, () =>
      new SaveDraftInteractor(createTestMessagingRepo(), accounts(), mockEntitlementService(), emailFiles()).invoke(
        data,
      ),
    );
  const send = (data: SendEmailData, provider: ReturnType<typeof providerStub>) =>
    runWithTenant(tenant, () => {
      const repo = createTestMessagingRepo();
      return new SendEmailInteractor(
        repo,
        accounts(),
        provider as unknown as MessagingService,
        mockEntitlementService(),
        new DraftSendGate(repo),
        emailFiles(),
      ).invoke(data);
    });
  const saved = async (data: SaveDraftData) => {
    const result = await save(data);
    if (!result.ok || !result.data.draftRevision) throw new Error("draft was not saved");
    return { id: result.data.id, threadId: result.data.messagingThreadId, revision: result.data.draftRevision };
  };
  const draftRow = async (id: string) =>
    (
      await client.query<{ subject: string | null; bodyText: string | null }>(
        'SELECT "subject", "bodyText" FROM "MessagingMessage" WHERE "id" = $1 AND "isDraft"',
        [id],
      )
    ).rows[0] ?? null;
  const nextMillisecond = () => new Promise((resolve) => setTimeout(resolve, 5));
  const pendingPdf = async () => {
    const id = randomUUID();
    const key = `draft-pdf-${id}`;
    const bytes = Buffer.from(`%PDF-${id}`);
    await client.query(
      'INSERT INTO "RecordFile" (id,"companyId","storageDriver","storageKey",name,"mimeType",size,"uploadedById","createdAt") VALUES ($1,$2,\'database\',$3,\'invoice.pdf\',\'application/pdf\',$4,$5,CURRENT_TIMESTAMP - INTERVAL \'2 days\')',
      [id, companyId, key, bytes.length, ownerId],
    );
    await client.query('INSERT INTO "RecordFileContent" ("fileKey",part,"companyId",data) VALUES ($1,0,$2,$3)', [
      key,
      companyId,
      bytes,
    ]);
    return { id, bytes };
  };
  const boundDraft = async (fileId: string) =>
    (await client.query('SELECT "draftMessageId" FROM "RecordFile" WHERE id=$1', [fileId])).rows[0]?.draftMessageId;
  const expiredFileIds = () =>
    runWithTenant(tenant, async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const files = await new PrismaRecordFileRepo().findExpiredFiles(
        { pendingBefore: yesterday, chatBefore: yesterday, detachedBefore: yesterday },
        100,
      );
      return files.map((file) => file.id);
    });

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, ownerEmail, "Draft", "Editor", companyId],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "provider", "unipileAccountId", "status", "emailAddress", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerId, MessagingProvider.mail, `unipile-${accountId}`, "ok", ownerEmail],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("keeps old uploads alive with their draft, rejects an outdated attachment revision and releases discarded files", async () => {
    const first = await pendingPdf();
    const second = await pendingPdf();
    const recipient = address("attachment-revision");
    const draft = await saved({
      connectedAccountId: accountId,
      recipients: [recipient],
      subject: "Attachment revision",
      body: "The invoice is attached",
      fileIds: [first.id],
    });
    expect(await boundDraft(first.id)).toBe(draft.id);
    expect(await expiredFileIds()).not.toContain(first.id);
    expect(await expiredFileIds()).toContain(second.id);

    const revised = await saved({ threadId: draft.threadId, body: "The invoice is attached", fileIds: [second.id] });
    expect(revised.revision).not.toBe(draft.revision);
    expect(await boundDraft(first.id)).toBeNull();
    expect(await boundDraft(second.id)).toBe(draft.id);
    const retained = await saved({ threadId: draft.threadId, body: "Please review the invoice" });
    const metadata = await client.query('SELECT "attachmentsMeta" FROM "MessagingMessage" WHERE id=$1', [draft.id]);
    expect(metadata.rows[0].attachmentsMeta).toEqual([expect.objectContaining({ fileId: second.id })]);

    const provider = providerStub();
    const stale = await send(
      {
        connectedAccountId: accountId,
        to: [{ identifier: recipient }],
        subject: "Attachment revision",
        body: "The invoice is attached",
        draftMessageId: draft.id,
        draftRevision: draft.revision,
      },
      provider,
    );
    expect(failureParams(stale)?.error).toBe(CustomErrorCode.draftChanged);
    expect(provider.sendEmail).not.toHaveBeenCalled();

    const discarded = await runWithTenant(tenant, () =>
      new DiscardDraftInteractor(createTestMessagingRepo(), mockEntitlementService()).invoke({
        messageId: draft.id,
        draftRevision: retained.revision,
      }),
    );
    expect(discarded.ok).toBe(true);
    expect(await expiredFileIds()).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  it("rolls back a new draft when its pending file already belongs to another draft", async () => {
    const file = await pendingPdf();
    const draft = await saved({
      connectedAccountId: accountId,
      recipients: [address("original")],
      subject: "Original file owner",
      body: "Review the invoice",
      fileIds: [file.id],
    });
    const subject = `Rolled back ${randomUUID()}`;
    const result = await save({
      connectedAccountId: accountId,
      recipients: [address("second")],
      subject,
      body: "Reuse the same pending upload",
      fileIds: [file.id],
    });

    expect(failureParams(result)?.error).toBe(CustomErrorCode.recordFileNotFound);
    expect(await boundDraft(file.id)).toBe(draft.id);
    expect((await client.query('SELECT id FROM "MessagingMessage" WHERE subject=$1', [subject])).rows).toEqual([]);
  });

  it("sends stored PDF bytes from the draft once and allows cleanup after sending", async () => {
    const file = await pendingPdf();
    const recipient = address("pdf-recipient");
    const draft = await saved({
      connectedAccountId: accountId,
      recipients: [recipient],
      subject: "Saved PDF",
      body: "Review the invoice",
      fileIds: [file.id],
    });
    await client.query('UPDATE "RecordFile" SET "uploadedById"=NULL WHERE id=$1', [file.id]);
    const provider = providerStub();
    const input = {
      connectedAccountId: accountId,
      to: [{ identifier: recipient }],
      subject: "Saved PDF",
      body: "Review the invoice",
      draftMessageId: draft.id,
      draftRevision: draft.revision,
    };

    expect((await send(input, provider)).ok).toBe(true);
    expect((await send(input, provider)).ok).toBe(true);
    expect(provider.sendEmail).toHaveBeenCalledOnce();
    expect(provider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { filename: "invoice.pdf", content_type: "application/pdf", content: file.bytes.toString("base64") },
        ],
      }),
    );
    expect(await expiredFileIds()).toContain(file.id);
  });

  it("requires saving a new revision after a pending PDF's bytes change", async () => {
    const file = await pendingPdf();
    const recipient = address("changed-pdf");
    const draft = await saved({
      connectedAccountId: accountId,
      recipients: [recipient],
      subject: "Changed PDF",
      body: "Review the invoice",
      fileIds: [file.id],
    });
    const changed = new Uint8Array(file.bytes);
    changed[5] ^= 1;
    const upload = await runWithTenant(tenant, () =>
      new UploadRecordFileContentInteractor(
        new PrismaRecordFileRepo(),
        () => new DatabaseFileStorageDriver(new PrismaFileContentRepo(), "http://127.0.0.1:4000"),
      ).invoke({
        fileId: file.id,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(changed);
            controller.close();
          },
        }),
      }),
    );
    expect(upload.ok).toBe(true);
    const provider = providerStub();
    const input = {
      connectedAccountId: accountId,
      to: [{ identifier: recipient }],
      subject: "Changed PDF",
      body: "Review the invoice",
      draftMessageId: draft.id,
      draftRevision: draft.revision,
    };

    const refused = await send(input, provider);
    expect(failureParams(refused)?.error).toBe(CustomErrorCode.draftChanged);
    expect(provider.sendEmail).not.toHaveBeenCalled();
    const revised = await saved({ threadId: draft.threadId, body: input.body, fileIds: [file.id] });
    expect(revised.revision).not.toBe(draft.revision);
    expect((await send({ ...input, draftRevision: revised.revision }, provider)).ok).toBe(true);
    expect(provider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          {
            filename: "invoice.pdf",
            content_type: "application/pdf",
            content: Buffer.from(changed).toString("base64"),
          },
        ],
      }),
    );
  });

  it("sends a saved Cc-only draft after the composer added a Bcc recipient", async () => {
    const cc = address("copy");
    const bcc = address("hidden");
    const draft = await saved({
      connectedAccountId: accountId,
      recipients: [],
      cc: [cc],
      subject: "Cc-only draft",
      body: "Saved body",
    });
    const provider = providerStub();

    const result = await send(
      {
        connectedAccountId: accountId,
        to: [],
        cc: [cc],
        bcc: [bcc],
        subject: "Cc-only draft",
        body: "Saved body, edited",
        bodyFormat: "markdown",
        draftMessageId: draft.id,
        draftRevision: draft.revision,
      },
      provider,
    );

    expect(result.ok).toBe(true);
    expect(provider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: [], cc: [{ email: cc }], bcc: [{ email: bcc }] }),
    );
    expect(await draftRow(draft.id)).toBeNull();
  });

  it("keeps a loaded draft sendable when another new email to the same recipient is saved as a draft", async () => {
    const recipient = address("recipient");
    const loaded = await saved({
      connectedAccountId: accountId,
      recipients: [recipient],
      subject: "First email",
      body: "First body",
    });
    await nextMillisecond();
    await save({
      connectedAccountId: accountId,
      recipients: [recipient],
      subject: "Second email",
      body: "Second body",
    });

    expect(await draftRow(loaded.id)).toEqual({ subject: "First email", bodyText: "First body" });

    const provider = providerStub();
    const result = await send(
      {
        connectedAccountId: accountId,
        to: [{ identifier: recipient }],
        subject: "First email",
        body: "First body, edited",
        bodyFormat: "markdown",
        draftMessageId: loaded.id,
        draftRevision: loaded.revision,
      },
      provider,
    );

    expect(result.ok).toBe(true);
    expect(provider.sendEmail).toHaveBeenCalledOnce();
  });

  it("reports a draft revised after the composer loaded it as changed, not as missing", async () => {
    const recipient = address("revised");
    const loaded = await saved({
      connectedAccountId: accountId,
      recipients: [recipient],
      subject: "Revised email",
      body: "Loaded body",
    });
    await nextMillisecond();
    const revised = await saved({ threadId: loaded.threadId, subject: "Revised email", body: "Agent revision" });
    expect(revised.id).toBe(loaded.id);

    const provider = providerStub();
    const result = await send(
      {
        connectedAccountId: accountId,
        to: [{ identifier: recipient }],
        subject: "Revised email",
        body: "Loaded body with the user's edits",
        bodyFormat: "markdown",
        draftMessageId: loaded.id,
        draftRevision: loaded.revision,
      },
      provider,
    );

    expect(result.ok).toBe(false);
    expect(failureParams(result)?.error).not.toBe(CustomErrorCode.draftMessageNotFound);
    expect(failureParams(result)?.kind).toBe("conflict");
    expect(provider.sendEmail).not.toHaveBeenCalled();
    expect(await draftRow(loaded.id)).toEqual({ subject: "Revised email", bodyText: "Agent revision" });
  });

  it("reports a send whose To no longer matches its saved new-email draft as a mismatch, not as missing", async () => {
    const recipient = address("bound");
    const draft = await saved({
      connectedAccountId: accountId,
      recipients: [recipient],
      subject: "Bound email",
      body: "Bound body",
    });
    const provider = providerStub();

    const result = await send(
      {
        connectedAccountId: accountId,
        to: [{ identifier: recipient }, { identifier: address("added") }],
        subject: "Bound email",
        body: "Bound body",
        bodyFormat: "markdown",
        draftMessageId: draft.id,
        draftRevision: draft.revision,
      },
      provider,
    );

    expect(result.ok).toBe(false);
    expect(failureParams(result)?.error).not.toBe(CustomErrorCode.draftMessageNotFound);
    expect(failureParams(result)?.kind).not.toBe("not_found");
    expect(provider.sendEmail).not.toHaveBeenCalled();
    expect(await draftRow(draft.id)).toEqual({ subject: "Bound email", bodyText: "Bound body" });
  });
});
