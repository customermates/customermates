import type { TenantUser } from "@/features/user/user.schema";
import type { MessagingService } from "../../messaging.service";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { PermissionService } from "@/core/base/permission.service";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { createTestMessagingRepo } from "@/tests/helpers/messaging-repository";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PrismaConnectedAccountRepo } from "../../persistence/prisma-connected-account.repository";
import { PrismaUnipileWebhookRepo } from "../../persistence/prisma-unipile-webhook.repository";
import { SaveDraftInteractor, type SaveDraftData } from "../save-draft.interactor";
import { DraftSendGate } from "../draft-send-gate";
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

  const accounts = () => new PrismaConnectedAccountRepo(new PermissionService(), new PrismaUnipileWebhookRepo());
  const save = (data: SaveDraftData) =>
    runWithTenant(tenant, () =>
      new SaveDraftInteractor(createTestMessagingRepo(), accounts(), mockEntitlementService()).invoke(data),
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
