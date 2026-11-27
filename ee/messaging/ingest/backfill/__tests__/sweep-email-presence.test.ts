import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import type { EmailSighting } from "../backfill.repo";

import { SweepEmailPresenceInteractor } from "../sweep-email-presence.interactor";
import { BACKFILL_EMAIL_PAGE_BUDGET } from "../paginate";

const CONNECTED_ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const account = {
  id: CONNECTED_ACCOUNT_ID,
  companyId: "company-1",
  unipileAccountId: "acc_imap",
  provider: "mail",
  status: "ok",
};

function build(listFolderEmails: ReturnType<typeof vi.fn>, folderIds: string[]) {
  const stored: EmailSighting[] = [];
  const repo = {
    findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
    clearEmailPresenceSweepUnscoped: vi.fn().mockImplementation(() => {
      stored.length = 0;
      return Promise.resolve();
    }),
    recordEmailSightingsUnscoped: vi.fn().mockImplementation(({ sightings }: { sightings: EmailSighting[] }) => {
      stored.push(...sightings);
      return Promise.resolve();
    }),
    listEmailSightingsUnscoped: vi.fn().mockImplementation(() => Promise.resolve([...stored])),
  };
  const ingest = {
    findEmailPresenceHorizonUnscoped: vi.fn().mockResolvedValue(new Date("2025-11-01T00:00:00.000Z")),
    reconcileEmailPresenceUnscoped: vi.fn().mockResolvedValue({ hidden: 0, relocated: 0 }),
  };
  const service = {
    listFolders: vi.fn().mockResolvedValue({ data: folderIds.map((id) => ({ id })), total_count: folderIds.length }),
    listFolderEmails,
  };
  const interactor = new SweepEmailPresenceInteractor(repo as never, service as never, ingest as never);

  return { interactor, repo, ingest, service };
}

async function drain(interactor: SweepEmailPresenceInteractor) {
  let cursor: string | null = null;
  let steps = 0;
  for (;;) {
    const result = await interactor.invoke({ connectedAccountId: CONNECTED_ACCOUNT_ID, cursor });
    steps += 1;
    if (result.done) return { result, steps };
    cursor = result.nextCursor;
  }
}

let clock = Date.now();

beforeEach(() => {
  vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
});

afterEach(() => vi.restoreAllMocks());

describe("email presence sweep across steps", () => {
  it("resumes where the previous step stopped and reconciles once with every sighting", async () => {
    const folderIds = Array.from({ length: 25 }, (_, index) => `F${String(index).padStart(2, "0")}`);
    const listFolderEmails = vi.fn().mockImplementation(({ folderId }: { folderId: string }) =>
      Promise.resolve({
        data: [{ id: `${folderId}-mail`, message_id: ` <${folderId}@example.invalid> ` }],
        next_cursor: null,
      }),
    );
    const { interactor, ingest, service } = build(listFolderEmails, folderIds);

    const { result, steps } = await drain(interactor);

    expect(result).toEqual({ nextCursor: null, done: true, complete: true });
    expect(steps).toBe(Math.ceil(folderIds.length / BACKFILL_EMAIL_PAGE_BUDGET));
    expect(service.listFolders).toHaveBeenCalledOnce();
    expect(listFolderEmails).toHaveBeenCalledTimes(folderIds.length);
    expect(ingest.reconcileEmailPresenceUnscoped).toHaveBeenCalledOnce();
    const [{ sightings, startedAt }] = ingest.reconcileEmailPresenceUnscoped.mock.calls[0];
    expect(startedAt).toBeInstanceOf(Date);
    expect(sightings).toHaveLength(folderIds.length);
    expect(sightings[0]).toEqual({
      folderId: "F00",
      unipileMessageId: "F00-mail",
      providerMessageId: "<F00@example.invalid>",
    });
  });

  it("follows a folder's cursor across steps", async () => {
    const pages = BACKFILL_EMAIL_PAGE_BUDGET + 3;
    const listFolderEmails = vi.fn().mockImplementation(({ cursor }: { cursor?: string }) => {
      const page = cursor ? Number(cursor) : 0;
      return Promise.resolve({
        data: [{ id: `mail-${page}`, message_id: null }],
        next_cursor: page + 1 < pages ? String(page + 1) : null,
      });
    });
    const { interactor, ingest } = build(listFolderEmails, ["F_SIGNALS"]);

    const { result, steps } = await drain(interactor);

    expect(result.complete).toBe(true);
    expect(steps).toBe(2);
    expect(listFolderEmails).toHaveBeenCalledTimes(pages);
    expect(ingest.reconcileEmailPresenceUnscoped.mock.calls[0][0].sightings).toHaveLength(pages);
  });

  it("gives up without reconciling when the account holds more mail than the page cap", async () => {
    const listFolderEmails = vi
      .fn()
      .mockImplementation(({ cursor }: { cursor?: string }) =>
        Promise.resolve({ data: [{ id: `mail-${cursor ?? 0}` }], next_cursor: String(Number(cursor ?? 0) + 1) }),
      );
    const { interactor, ingest, repo } = build(listFolderEmails, ["F_INBOX"]);

    const { result } = await drain(interactor);

    expect(result).toEqual({ nextCursor: null, done: true, complete: false });
    expect(ingest.reconcileEmailPresenceUnscoped).not.toHaveBeenCalled();
    expect(repo.clearEmailPresenceSweepUnscoped).toHaveBeenCalledTimes(2);
  });

  it("finishes at once when the account stores no placed mail", async () => {
    const { interactor, ingest, service } = build(vi.fn(), ["F_INBOX"]);
    ingest.findEmailPresenceHorizonUnscoped.mockResolvedValue(null);

    const { result } = await drain(interactor);

    expect(result).toEqual({ nextCursor: null, done: true, complete: true });
    expect(service.listFolderEmails).not.toHaveBeenCalled();
    expect(ingest.reconcileEmailPresenceUnscoped).not.toHaveBeenCalled();
  });

  it("restarts from scratch when a stored cursor cannot be read", async () => {
    const { interactor, ingest } = build(vi.fn(), ["F_INBOX"]);

    const result = await interactor.invoke({ connectedAccountId: CONNECTED_ACCOUNT_ID, cursor: "not-json" });

    expect(result).toEqual({ nextCursor: null, done: true, complete: false });
    expect(ingest.reconcileEmailPresenceUnscoped).not.toHaveBeenCalled();
  });
});
