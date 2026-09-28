import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { ForbiddenError } from "@/core/errors/app-errors";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";

import { StartWikiHomepageSetupInteractor } from "../start-wiki-homepage-setup.interactor";

const CLIENT_REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const CRAWL: {
  id: string;
  homepageUrl: string;
  registrableDomain: string;
  conversationId: string | null;
  pendingHosts: string[];
  extraHosts: string[];
} = {
  id: "00000000-0000-4000-8000-000000000009",
  homepageUrl: "https://example.com/",
  registrableDomain: "example.com",
  conversationId: null,
  pendingHosts: ["acme.zendesk.com"],
  extraHosts: [],
};

function harness(
  options: { empty?: boolean; reusable?: typeof CRAWL | null; latest?: typeof CRAWL | null; active?: boolean } = {},
) {
  const repo = { wikiIsEmpty: vi.fn().mockResolvedValue(options.empty ?? true) };
  const crawlRepo = {
    findCrawlByClientRequest: vi.fn().mockResolvedValue(options.reusable ?? null),
    findLatestCrawl: vi.fn().mockResolvedValue(options.latest ?? null),
    createCrawl: vi
      .fn()
      .mockImplementation((data: { homepageUrl: string; registrableDomain: string; extraHosts: string[] }) =>
        Promise.resolve(options.active ? { status: "active" } : { status: "created", crawl: { ...CRAWL, ...data } }),
      ),
  };
  const background = { dispatch: vi.fn().mockResolvedValue(undefined) };
  const interactor = new StartWikiHomepageSetupInteractor(repo, crawlRepo, background as never);
  return { repo, crawlRepo, background, interactor };
}

function errorCode(result: unknown) {
  return (result as { ok: false; error: { issues: Array<{ params?: { error?: unknown } }> } }).error.issues[0]?.params
    ?.error;
}

beforeEach(() => vi.clearAllMocks());

describe("StartWikiHomepageSetupInteractor", () => {
  it("rejects a Wiki Read-only member before touching setup state", async () => {
    const { repo, crawlRepo, background, interactor } = harness();
    const readOnly = createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]);

    await expect(
      runWithTenant(readOnly, () =>
        interactor.invoke({ homepage: "example.com", clientRequestId: CLIENT_REQUEST_ID, locale: "en" }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(crawlRepo.createCrawl).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("records one crawl for the canonical homepage and dispatches the durable website import", async () => {
    const { crawlRepo, background, interactor } = harness();
    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ homepage: "Example.com/about?x=1", clientRequestId: CLIENT_REQUEST_ID, locale: "de" }),
    );

    expect(result).toEqual({
      ok: true,
      data: { conversationId: null, homepage: "https://example.com/about", domain: "example.com" },
    });
    expect(crawlRepo.createCrawl).toHaveBeenCalledExactlyOnceWith({
      clientRequestId: CLIENT_REQUEST_ID,
      homepageUrl: "https://example.com/about",
      registrableDomain: "example.com",
      locale: "de",
      mode: "initial",
      extraHosts: [],
    });
    expect(background.dispatch).toHaveBeenCalledExactlyOnceWith("crawl-wiki-website", {
      crawlId: CRAWL.id,
      userId: mockUser.id,
    });
  });

  it("replays an existing request without dispatching again, even after its pages fill the Wiki", async () => {
    const { repo, crawlRepo, background, interactor } = harness({
      empty: false,
      reusable: { ...CRAWL, conversationId: "00000000-0000-4000-8000-000000000002" },
    });
    expect(
      await runWithTenant(mockUser, () =>
        interactor.invoke({ homepage: "example.com", clientRequestId: CLIENT_REQUEST_ID, locale: "en" }),
      ),
    ).toMatchObject({ ok: true, data: { conversationId: "00000000-0000-4000-8000-000000000002" } });
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(crawlRepo.createCrawl).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("refuses unsafe homepages, a non-empty Wiki for a first import, and a second active import", async () => {
    const unsafe = harness();
    expect(
      errorCode(
        await runWithTenant(mockUser, () =>
          unsafe.interactor.invoke({ homepage: "http://127.0.0.1", clientRequestId: CLIENT_REQUEST_ID, locale: "en" }),
        ),
      ),
    ).toBe(CustomErrorCode.invalidUrl);

    const filled = harness({ empty: false });
    expect(
      errorCode(
        await runWithTenant(mockUser, () =>
          filled.interactor.invoke({ homepage: "example.com", clientRequestId: CLIENT_REQUEST_ID, locale: "en" }),
        ),
      ),
    ).toBe(CustomErrorCode.wikiNotEmpty);

    const busy = harness({ active: true });
    expect(
      errorCode(
        await runWithTenant(mockUser, () =>
          busy.interactor.invoke({ homepage: "example.com", clientRequestId: CLIENT_REQUEST_ID, locale: "en" }),
        ),
      ),
    ).toBe(CustomErrorCode.agentTurnAlreadyRunning);
    for (const run of [unsafe, filled, busy]) expect(run.background.dispatch).not.toHaveBeenCalled();
  });

  it("refreshes the last imported site and extends it with a help centre the user names", async () => {
    const refresh = harness({ empty: false, latest: { ...CRAWL, extraHosts: ["acme.zendesk.com"] } });
    await runWithTenant(mockUser, () =>
      refresh.interactor.invoke({
        homepage: "ignored",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "en",
        mode: "refresh",
      }),
    );
    expect(refresh.crawlRepo.createCrawl).toHaveBeenCalledWith(
      expect.objectContaining({ homepageUrl: CRAWL.homepageUrl, mode: "refresh", extraHosts: ["acme.zendesk.com"] }),
    );

    const extend = harness({ empty: false, latest: CRAWL });
    expect(
      await runWithTenant(mockUser, () =>
        extend.interactor.invoke({
          homepage: "https://acme.zendesk.com/hc/en-us",
          clientRequestId: CLIENT_REQUEST_ID,
          locale: "en",
          mode: "extend",
        }),
      ),
    ).toMatchObject({ ok: true, data: { homepage: "https://acme.zendesk.com/hc/en-us", domain: "example.com" } });
    expect(extend.crawlRepo.createCrawl).toHaveBeenCalledWith(
      expect.objectContaining({ registrableDomain: "example.com", mode: "extend", extraHosts: ["acme.zendesk.com"] }),
    );

    const sameSite = harness({ empty: false, latest: CRAWL });
    expect(
      errorCode(
        await runWithTenant(mockUser, () =>
          sameSite.interactor.invoke({
            homepage: "https://example.com/help",
            clientRequestId: CLIENT_REQUEST_ID,
            locale: "en",
            mode: "extend",
          }),
        ),
      ),
    ).toBe(CustomErrorCode.invalidUrl);
  });
});
