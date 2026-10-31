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
import { BACKFILL_EMAIL_PAGE_BUDGET, BACKFILL_EMAIL_STEP_BUDGET_MS } from "../paginate";

const CONNECTED_ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const FOLDER = "INBOX";

const account = {
  id: "acc-1",
  companyId: "co-1",
  unipileAccountId: "acc_uni-1",
  provider: "mail",
  status: "ok",
  emailAddress: "me@ex.com",
  sentFolderIds: [],
} as never;

function email(id: string) {
  return {
    id,
    message_id: `<${id}@ex.com>`,
    date: "2026-08-01T00:00:00.000Z",
    from_attendee: { identifier: "them@ex.com" },
    to_attendees: [{ identifier: "me@ex.com" }],
    folders: [FOLDER],
    subject: "s",
    body: "b",
  };
}

const endlessFolder = (query: { cursor?: string }) => {
  const index = Number(query.cursor ?? 0);
  return Promise.resolve({ data: [email(`mail-${index}`)], next_cursor: String(index + 1) });
};

let clock = Date.now();

function build(listFolderEmails: ReturnType<typeof vi.fn>, ingestMessageUnscoped = vi.fn().mockResolvedValue({})) {
  const ingest = {
    ingestMessageUnscoped,
    reconcileFolderMembershipUnscoped: vi.fn().mockResolvedValue(0),
  };
  const repo = {
    findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
    recordUnusableItemUnscoped: vi.fn().mockResolvedValue(undefined),
    clearEmailFolderPassUnscoped: vi.fn().mockResolvedValue(undefined),
    recordEmailFolderPassSeenUnscoped: vi.fn().mockResolvedValue(undefined),
    listEmailFolderPassSeenUnscoped: vi.fn().mockResolvedValue([]),
  };
  const interactor = new BackfillEmailsInteractor(
    repo as never,
    { listFolderEmails } as never,
    ingest as never,
    () => ({ synchronize: () => Promise.resolve() }),
  );

  return { interactor, ingest };
}

const invoke = (interactor: BackfillEmailsInteractor) =>
  interactor.invoke({ connectedAccountId: CONNECTED_ACCOUNT_ID, source: FOLDER, cursor: null } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
});

afterEach(() => vi.restoreAllMocks());

describe("email backfill step budget", () => {
  it("returns a cursor after the page budget instead of walking the whole folder in one step", async () => {
    const listFolderEmails = vi.fn().mockImplementation(endlessFolder);
    const { interactor } = build(listFolderEmails);

    const result = await invoke(interactor);

    expect(listFolderEmails).toHaveBeenCalledTimes(BACKFILL_EMAIL_PAGE_BUDGET);
    expect(result).toEqual({ nextCursor: `c:${BACKFILL_EMAIL_PAGE_BUDGET}`, done: false, complete: false });
  });

  it("returns a cursor once the step has spent its time budget", async () => {
    const listFolderEmails = vi.fn().mockImplementation(endlessFolder);
    const slowIngest = vi.fn().mockImplementation(() => {
      clock += BACKFILL_EMAIL_STEP_BUDGET_MS / 2;
      return Promise.resolve({});
    });
    const { interactor } = build(listFolderEmails, slowIngest);

    const result = await invoke(interactor);

    expect(listFolderEmails).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ nextCursor: "c:2", done: false, complete: false });
  });
});
