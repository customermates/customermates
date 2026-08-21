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
import { UNIPILE_EMAIL_MAX_LIMIT } from "../paginate";
import { UnipileRequestError } from "../../../messaging.service";

const CONNECTED_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const FOLDER = "INBOX";

const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "google",
  status: "ok",
  emailAddress: "me@ex.com",
  sentFolderIds: [],
} as never;

function email(index: number) {
  return {
    id: `mail-${index}`,
    message_id: `<m${index}@ex.com>`,
    date: "2026-08-01T00:00:00.000Z",
    from_attendee: { identifier: "them@ex.com" },
    to_attendees: [{ identifier: "me@ex.com" }],
    folders: [FOLDER],
    subject: "s",
    body: "b",
  };
}

const fullPage = Array.from({ length: UNIPILE_EMAIL_MAX_LIMIT }, (_, i) => email(i));

function cursorPaginationError() {
  return new UnipileRequestError(
    400,
    "provider/invalid_parameters",
    '{"type":"provider/invalid_parameters","detail":"Gmail use cursor for pagination."}',
  );
}

function build(listFolderEmails: ReturnType<typeof vi.fn>) {
  const ingest = {
    upsertChatThreadUnscoped: vi.fn().mockResolvedValue({ id: "thread-1" }),
    ingestMessageUnscoped: vi.fn().mockResolvedValue(undefined),
    reconcileFolderMembershipUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const repo = {
    findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const interactor = new BackfillEmailsInteractor(repo as never, { listFolderEmails } as never, ingest as never);

  return { interactor, ingest };
}

const invoke = (interactor: BackfillEmailsInteractor) =>
  interactor.invoke({ connectedAccountId: CONNECTED_ACCOUNT_ID, source: FOLDER, cursor: null } as never);

beforeEach(() => vi.clearAllMocks());

describe("folder reconciliation after a backfill page walk", () => {
  it("reconciles when the walk genuinely reached the end of the folder", async () => {
    const listFolderEmails = vi.fn().mockResolvedValue({ data: [email(0), email(1)], next_cursor: null });
    const { interactor, ingest } = build(listFolderEmails);

    const result = await invoke(interactor);

    expect(result.complete).toBe(true);
    expect(ingest.reconcileFolderMembershipUnscoped).toHaveBeenCalledOnce();
  });

  it("does not reconcile when the walk stopped on a cursor-pagination rejection", async () => {
    const listFolderEmails = vi
      .fn()
      .mockResolvedValueOnce({ data: fullPage, next_cursor: null })
      .mockRejectedValueOnce(cursorPaginationError());
    const { interactor, ingest } = build(listFolderEmails);

    const result = await invoke(interactor);

    expect(result.done).toBe(true);
    expect(result.complete).toBe(false);
    expect(ingest.reconcileFolderMembershipUnscoped).not.toHaveBeenCalled();
  });
});
