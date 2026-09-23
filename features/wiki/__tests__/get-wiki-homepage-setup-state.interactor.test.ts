import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { GetWikiHomepageSetupStateInteractor } from "../get-wiki-homepage-setup-state.interactor";

const PAGE = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Company Overview",
  createdAt: new Date("2026-09-22T09:00:00.000Z"),
  updatedAt: new Date("2026-09-22T09:00:00.000Z"),
};
const SETUP = {
  status: "running" as const,
  terminalCode: null,
  homepage: "https://example.com/",
  domain: "example.com",
  conversationId: "conversation-1",
  affectedResources: [],
  activityAt: new Date("2099-09-22T09:00:00.000Z"),
};

beforeEach(() => vi.clearAllMocks());

describe("GetWikiHomepageSetupStateInteractor", () => {
  it("returns idle when neither pages nor a setup turn exist", async () => {
    const repo = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({ setup: null, pages: [] }),
    };

    await expect(new GetWikiHomepageSetupStateInteractor(repo).invoke()).resolves.toEqual({
      ok: true,
      data: {
        status: "idle",
        homepage: null,
        domain: null,
        conversationId: null,
        pages: [],
      },
    });
  });

  it.each(["running", "waitingBudget"] as const)("restores %s setup as working after refresh", async (status) => {
    const repo = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({ setup: { ...SETUP, status }, pages: [] }),
    };

    await expect(new GetWikiHomepageSetupStateInteractor(repo).invoke()).resolves.toMatchObject({
      ok: true,
      data: {
        status: "working",
        homepage: SETUP.homepage,
        domain: SETUP.domain,
        conversationId: SETUP.conversationId,
      },
    });
  });

  it("keeps an active setup visible when another client creates a page", async () => {
    const repo = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({ setup: SETUP, pages: [PAGE] }),
    };

    await expect(new GetWikiHomepageSetupStateInteractor(repo).invoke()).resolves.toMatchObject({
      data: { status: "working", pages: [] },
    });
  });

  it("reports pages as complete even when they were created manually", async () => {
    const repo = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({ setup: null, pages: [PAGE] }),
    };

    await expect(new GetWikiHomepageSetupStateInteractor(repo).invoke()).resolves.toEqual({
      ok: true,
      data: {
        status: "completed",
        homepage: null,
        domain: null,
        conversationId: null,
        pages: [PAGE],
      },
    });
  });

  it("does not attribute manually created pages to an earlier failed setup", async () => {
    const repo = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({
        setup: { ...SETUP, status: "failed", terminalCode: "error" },
        pages: [PAGE],
      }),
    };

    await expect(new GetWikiHomepageSetupStateInteractor(repo).invoke()).resolves.toEqual({
      ok: true,
      data: {
        status: "completed",
        homepage: null,
        domain: null,
        conversationId: null,
        pages: [PAGE],
      },
    });
  });

  it("keeps a completed zero-page turn distinct without claiming why no pages were created", async () => {
    const noContent = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({
        setup: { ...SETUP, status: "completed", terminalCode: "completed" },
        pages: [],
      }),
    };
    const failed = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({
        setup: { ...SETUP, status: "failed", terminalCode: "error" },
        pages: [],
      }),
    };

    await expect(new GetWikiHomepageSetupStateInteractor(noContent).invoke()).resolves.toMatchObject({
      data: { status: "noContent" },
    });
    await expect(new GetWikiHomepageSetupStateInteractor(failed).invoke()).resolves.toMatchObject({
      data: { status: "failed" },
    });
  });

  it.each(["needsAttention", "uncertain"] as const)("allows a terminal %s setup to be retried", async (status) => {
    const repo = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({ setup: { ...SETUP, status }, pages: [] }),
    };

    await expect(new GetWikiHomepageSetupStateInteractor(repo).invoke()).resolves.toMatchObject({
      data: { status: "failed" },
    });
  });

  it("does not poll forever after a running setup lease becomes stale", async () => {
    const repo = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({
        setup: { ...SETUP, activityAt: new Date("2020-01-01T00:00:00.000Z") },
        pages: [],
      }),
    };

    await expect(new GetWikiHomepageSetupStateInteractor(repo).invoke()).resolves.toMatchObject({
      data: { status: "failed" },
    });
  });

  it("returns to idle when the pages from a successful setup were later deleted", async () => {
    const repo = {
      getHomepageSetupProjection: vi.fn().mockResolvedValue({
        setup: {
          ...SETUP,
          status: "completed",
          terminalCode: "completed",
          affectedResources: ["wiki"],
        },
        pages: [],
      }),
    };

    await expect(new GetWikiHomepageSetupStateInteractor(repo).invoke()).resolves.toMatchObject({
      data: { status: "idle", homepage: null, conversationId: null },
    });
  });
});
