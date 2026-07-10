import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({ ...createMockDiModule(() => mockUser) }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { BackfillEmailsInteractor } from "../backfill-emails.interactor";
import { ACCOUNT_WIDE_SOURCE } from "../prepare-backfill.interactor";

const CONNECTED_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "google",
  status: "ok",
  emailAddress: "me@ex.com",
  sentFolderIds: [],
} as any;

function build(emails: unknown[]) {
  const messagingService = {
    listEmails: vi.fn().mockResolvedValue({ data: emails, next_cursor: null }),
  };
  const ingest = {
    upsertChatThreadUnscoped: vi.fn().mockResolvedValue({ id: "thread-1" }),
    ingestMessageUnscoped: vi.fn().mockResolvedValue(undefined),
    reconcileFolderMembershipUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const repo = {
    findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const interactor = new BackfillEmailsInteractor(repo as any, messagingService as any, ingest as any);

  return { interactor, messagingService, ingest, repo };
}

function invoke(interactor: BackfillEmailsInteractor) {
  return interactor.invoke({
    connectedAccountId: CONNECTED_ACCOUNT_ID,
    source: ACCOUNT_WIDE_SOURCE,
    cursor: null,
  } as any);
}

beforeEach(() => vi.clearAllMocks());

describe("email backfill", () => {
  it("dead-letters a Unipile empty email shell (no id) instead of ingesting or silently skipping", async () => {
    const emptyShell = {
      id: "",
      message_id: "",
      thread_id: "",
      subject: "",
      body: "",
      date: "2026-07-08T10:00:00.000Z",
    };
    const { interactor, ingest, repo } = build([emptyShell]);

    await invoke(interactor);

    expect(repo.recordUnusableItemUnscoped).toHaveBeenCalledOnce();
    expect(ingest.ingestMessageUnscoped).not.toHaveBeenCalled();
  });

  it("ingests a real email", async () => {
    const validEmail = {
      id: "em-1",
      thread_id: "th-1",
      date: "2026-07-08T10:00:00.000Z",
      subject: "Hi",
      from: [{ email: "sender@ex.com", display_name: "Sender" }],
      to: [{ email: "me@ex.com" }],
    };
    const { interactor, ingest, repo } = build([validEmail]);

    await invoke(interactor);

    expect(ingest.ingestMessageUnscoped).toHaveBeenCalledOnce();
    expect(repo.recordUnusableItemUnscoped).not.toHaveBeenCalled();
  });

  it("dead-letters a genuinely malformed item (schema parse failure)", async () => {
    const { interactor, ingest, repo } = build([{ not: "an email" }]);

    await invoke(interactor);

    expect(repo.recordUnusableItemUnscoped).toHaveBeenCalledOnce();
    expect(ingest.ingestMessageUnscoped).not.toHaveBeenCalled();
  });

  it("on write failure dead-letters the email", async () => {
    const validEmail = {
      id: "em-2",
      thread_id: "th-2",
      date: "2026-07-08T10:00:00.000Z",
      subject: "Boom",
      from: [{ email: "sender@ex.com" }],
      to: [{ email: "me@ex.com" }],
    };
    const { interactor, ingest, repo } = build([validEmail]);
    ingest.ingestMessageUnscoped.mockRejectedValueOnce(new Error("db down"));

    await invoke(interactor);

    expect(repo.recordUnusableItemUnscoped).toHaveBeenCalledOnce();
  });
});
