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
  userId: string;
  status: string;
  failureReason: string | null;
  mode: string;
  homepageUrl: string;
  registrableDomain: string;
  conversationId: string | null;
  pendingHosts: string[];
  extraHosts: string[];
} = {
  id: "00000000-0000-4000-8000-000000000009",
  userId: mockUser.id,
  status: "queued",
  failureReason: null,
  mode: "initial",
  homepageUrl: "https://example.com/",
  registrableDomain: "example.com",
  conversationId: null,
  pendingHosts: ["acme.zendesk.com"],
  extraHosts: [],
};

function harness(
  options: {
    empty?: boolean;
    reusable?: typeof CRAWL | null;
    latest?: typeof CRAWL | null;
    active?: boolean;
  } = {},
) {
  const repo = {
    dominantWikiLanguage: vi.fn().mockResolvedValue(null),
    wikiIsEmpty: vi.fn().mockResolvedValue(options.empty ?? true),
  };
  const crawlRepo = {
    findCrawlByClientRequest: vi.fn().mockResolvedValue(options.reusable ?? null),
    findLatestCrawl: vi.fn().mockResolvedValue(options.latest ?? null),
    findRefreshHomepage: vi.fn().mockResolvedValue(CRAWL.homepageUrl),
    failDispatch: vi.fn().mockResolvedValue(undefined),
    retryFailedDispatch: vi.fn().mockResolvedValue(CRAWL),
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
  return (
    result as {
      ok: false;
      error: { issues: Array<{ params?: { error?: unknown } }> };
    }
  ).error.issues[0]?.params?.error;
}

beforeEach(() => vi.clearAllMocks());

describe("StartWikiHomepageSetupInteractor", () => {
  it("freezes the dominant existing Wiki language over the caller fallback", async () => {
    const { interactor, repo, crawlRepo } = harness({
      latest: CRAWL,
      empty: false,
    });
    repo.dominantWikiLanguage.mockResolvedValue("de");
    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({
        homepage: "example.com",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "fr",
        mode: "refresh",
      }),
    );
    expect(result.ok).toBe(true);
    expect(crawlRepo.createCrawl).toHaveBeenCalledWith(expect.objectContaining({ locale: "de" }));
  });

  it("uses the validated browser or selector fallback when there is no Wiki majority", async () => {
    const { interactor, crawlRepo } = harness();
    await runWithTenant(mockUser, () =>
      interactor.invoke({
        homepage: "example.com",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "it",
      }),
    );
    expect(crawlRepo.createCrawl).toHaveBeenCalledWith(expect.objectContaining({ locale: "it" }));
  });

  it("rejects a Wiki Read-only member before touching setup state", async () => {
    const { repo, crawlRepo, background, interactor } = harness();
    const readOnly = createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]);

    await expect(
      runWithTenant(readOnly, () =>
        interactor.invoke({
          homepage: "example.com",
          clientRequestId: CLIENT_REQUEST_ID,
          locale: "en",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(crawlRepo.createCrawl).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("records one crawl for the canonical homepage and dispatches the durable website import", async () => {
    const { crawlRepo, background, interactor } = harness();
    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({
        homepage: "Example.com/about?x=1",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "de",
      }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        conversationId: null,
        homepage: "https://example.com/about",
        domain: "example.com",
      },
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
      reusable: {
        ...CRAWL,
        status: "completed",
        conversationId: "00000000-0000-4000-8000-000000000002",
      },
    });
    expect(
      await runWithTenant(mockUser, () =>
        interactor.invoke({
          homepage: "example.com",
          clientRequestId: CLIENT_REQUEST_ID,
          locale: "en",
        }),
      ),
    ).toMatchObject({
      ok: true,
      data: { conversationId: "00000000-0000-4000-8000-000000000002" },
    });
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(crawlRepo.createCrawl).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("refuses unsafe homepages, a non-empty Wiki for a first import, and a second active import", async () => {
    const unsafe = harness();
    expect(
      errorCode(
        await runWithTenant(mockUser, () =>
          unsafe.interactor.invoke({
            homepage: "http://127.0.0.1",
            clientRequestId: CLIENT_REQUEST_ID,
            locale: "en",
          }),
        ),
      ),
    ).toBe(CustomErrorCode.invalidUrl);

    const filled = harness({ empty: false });
    expect(
      errorCode(
        await runWithTenant(mockUser, () =>
          filled.interactor.invoke({
            homepage: "example.com",
            clientRequestId: CLIENT_REQUEST_ID,
            locale: "en",
          }),
        ),
      ),
    ).toBe(CustomErrorCode.wikiNotEmpty);

    const busy = harness({ active: true });
    expect(
      errorCode(
        await runWithTenant(mockUser, () =>
          busy.interactor.invoke({
            homepage: "example.com",
            clientRequestId: CLIENT_REQUEST_ID,
            locale: "en",
          }),
        ),
      ),
    ).toBe(CustomErrorCode.agentTurnAlreadyRunning);
    for (const run of [unsafe, filled, busy]) expect(run.background.dispatch).not.toHaveBeenCalled();
  });

  it("refreshes the last imported site and extends it with a help centre the user names", async () => {
    const refresh = harness({
      empty: false,
      latest: { ...CRAWL, extraHosts: ["acme.zendesk.com"] },
    });
    await runWithTenant(mockUser, () =>
      refresh.interactor.invoke({
        homepage: "ignored",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "en",
        mode: "refresh",
      }),
    );
    expect(refresh.crawlRepo.createCrawl).toHaveBeenCalledWith(
      expect.objectContaining({
        homepageUrl: CRAWL.homepageUrl,
        mode: "refresh",
        extraHosts: ["acme.zendesk.com"],
      }),
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
    ).toMatchObject({
      ok: true,
      data: {
        homepage: "https://acme.zendesk.com/hc/en-us",
        domain: "example.com",
      },
    });
    expect(extend.crawlRepo.createCrawl).toHaveBeenCalledWith(
      expect.objectContaining({
        registrableDomain: "example.com",
        mode: "extend",
        extraHosts: ["acme.zendesk.com"],
      }),
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
  it("redispatches a queued request after a transient or ambiguous dispatch failure", async () => {
    const { crawlRepo, background, interactor } = harness();
    const data = {
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en" as const,
    };
    background.dispatch.mockRejectedValueOnce(new Error("queue unavailable"));
    await expect(runWithTenant(mockUser, () => interactor.invoke(data))).rejects.toThrow("queue unavailable");
    expect(crawlRepo.failDispatch).toHaveBeenCalledWith(CRAWL.id);
    crawlRepo.findCrawlByClientRequest.mockResolvedValue({
      ...CRAWL,
      status: "failed",
      failureReason: "dispatch",
    });
    await expect(runWithTenant(mockUser, () => interactor.invoke(data))).resolves.toMatchObject({ ok: true });
    expect(crawlRepo.createCrawl).toHaveBeenCalledTimes(1);
    expect(background.dispatch).toHaveBeenCalledTimes(2);
    expect(background.dispatch).toHaveBeenLastCalledWith("crawl-wiki-website", {
      crawlId: CRAWL.id,
      userId: mockUser.id,
    });
  });

  it("recovers the same queued target under a new request ID without creating another crawl", async () => {
    const { background, interactor } = harness({ active: true, latest: CRAWL });
    await expect(
      runWithTenant(mockUser, () =>
        interactor.invoke({
          homepage: "example.com",
          clientRequestId: CLIENT_REQUEST_ID,
          locale: "en",
        }),
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(background.dispatch).toHaveBeenCalledExactlyOnceWith("crawl-wiki-website", {
      crawlId: CRAWL.id,
      userId: mockUser.id,
    });
  });

  it("does not hijack an unrelated queued target or redispatch a working crawl", async () => {
    for (const latest of [
      { ...CRAWL, homepageUrl: "https://other.example.com/" },
      { ...CRAWL, status: "fetching" },
    ]) {
      const { background, interactor } = harness({ active: true, latest });
      const result = await runWithTenant(mockUser, () =>
        interactor.invoke({
          homepage: "example.com",
          clientRequestId: CLIENT_REQUEST_ID,
          locale: "en",
        }),
      );
      expect(errorCode(result)).toBe(CustomErrorCode.agentTurnAlreadyRunning);
      expect(background.dispatch).not.toHaveBeenCalled();
    }
  });

  it("preserves the original homepage and approved hosts after an external extension", async () => {
    const { crawlRepo, interactor } = harness({
      empty: false,
      latest: {
        ...CRAWL,
        mode: "extend",
        status: "completed",
        homepageUrl: "https://acme.zendesk.com/hc/en-us",
        extraHosts: ["acme.zendesk.com"],
      },
    });
    await runWithTenant(mockUser, () =>
      interactor.invoke({
        homepage: "refresh",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "en",
        mode: "refresh",
      }),
    );
    expect(crawlRepo.createCrawl).toHaveBeenCalledWith(
      expect.objectContaining({
        homepageUrl: CRAWL.homepageUrl,
        registrableDomain: "example.com",
        extraHosts: ["acme.zendesk.com"],
      }),
    );
  });
});
