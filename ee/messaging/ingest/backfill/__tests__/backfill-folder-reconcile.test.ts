import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { UnipileRequestError } from "../../../unipile-request-error";

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
  const folderIdsByMessage = new Map<string, string[]>([["stale", [FOLDER]]]);
  const passSeen = new Set<string>();
  const ingest = {
    upsertChatThreadUnscoped: vi.fn().mockResolvedValue({ id: "thread-1" }),
    ingestMessageUnscoped: vi.fn().mockImplementation(({ message }) => {
      const current = folderIdsByMessage.get(message.unipileMessageId) ?? [];
      folderIdsByMessage.set(message.unipileMessageId, [...new Set([...current, ...message.folderIds])]);
      return Promise.resolve({});
    }),
    reconcileFolderMembershipUnscoped: vi.fn().mockImplementation(({ folderId, seenUnipileMessageIds }) => {
      const seen = new Set(seenUnipileMessageIds);
      for (const [id, folderIds] of folderIdsByMessage) {
        if (!seen.has(id)) {
          folderIdsByMessage.set(
            id,
            folderIds.filter((entry) => entry !== folderId),
          );
        }
      }
      return Promise.resolve(0);
    }),
  };
  const repo = {
    findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
    clearEmailFolderPassUnscoped: vi.fn().mockImplementation(() => {
      passSeen.clear();
      return Promise.resolve();
    }),
    recordEmailFolderPassSeenUnscoped: vi.fn().mockImplementation(({ unipileMessageIds }) => {
      for (const id of unipileMessageIds) passSeen.add(id);
      return Promise.resolve();
    }),
    listEmailFolderPassSeenUnscoped: vi.fn().mockImplementation(() => Promise.resolve([...passSeen])),
  };
  const interactor = new BackfillEmailsInteractor(
    repo as never,
    { listFolderEmails } as never,
    ingest as never,
    () => ({
      synchronize: () => Promise.resolve(),
    }),
  );

  return { interactor, ingest, folderIdsByMessage };
}

const invoke = (interactor: BackfillEmailsInteractor, cursor: string | null = null) =>
  interactor.invoke({ connectedAccountId: CONNECTED_ACCOUNT_ID, source: FOLDER, cursor } as never);

async function drainFolder(interactor: BackfillEmailsInteractor) {
  let cursor: string | null = null;
  let steps = 0;
  for (;;) {
    const result = await invoke(interactor, cursor);
    steps += 1;
    if (result.done) return { result, steps };
    cursor = result.nextCursor;
  }
}

let clock = Date.now();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
});

afterEach(() => vi.restoreAllMocks());

describe("folder reconciliation after a backfill page walk", () => {
  it("reconciles when the walk genuinely reached the end of the folder", async () => {
    const listFolderEmails = vi.fn().mockResolvedValue({ data: [email(0), email(1)], next_cursor: null });
    const { interactor, ingest } = build(listFolderEmails);

    const result = await invoke(interactor);

    expect(result.complete).toBe(true);
    expect(ingest.reconcileFolderMembershipUnscoped).toHaveBeenCalledOnce();
  });

  it("drops a stale placement when the folder walk spans several steps", async () => {
    const pageCount = 201;
    const listFolderEmails = vi.fn().mockImplementation((query: { cursor?: string }) => {
      const index = Number(query.cursor ?? 0);
      return Promise.resolve({
        data: [email(index)],
        next_cursor: index + 1 < pageCount ? String(index + 1) : null,
      });
    });
    const { interactor, folderIdsByMessage } = build(listFolderEmails);

    const { result, steps } = await drainFolder(interactor);

    expect(steps).toBeGreaterThan(1);
    expect(result.complete).toBe(true);
    expect(folderIdsByMessage.get("stale")).toEqual([]);
    expect(folderIdsByMessage.get("mail-0")).toEqual([FOLDER]);
    expect(folderIdsByMessage.get(`mail-${pageCount - 1}`)).toEqual([FOLDER]);
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
