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

import {
  StartWikiHomepageSetupInteractor,
  type StartWikiHomepageSetupRepo,
  type StartWikiHomepageSetupTurnRepo,
} from "../start-wiki-homepage-setup.interactor";

const CLIENT_REQUEST_ID = "00000000-0000-4000-8000-000000000001";

function setupInteractor(
  repo: StartWikiHomepageSetupRepo & StartWikiHomepageSetupTurnRepo,
  agent: { invoke: unknown },
) {
  return new StartWikiHomepageSetupInteractor(repo, repo, agent as never);
}

beforeEach(() => vi.clearAllMocks());

describe("StartWikiHomepageSetupInteractor", () => {
  it("rejects a Wiki Read-only member before checking setup state or dispatching a paid turn", async () => {
    const repo = { wikiIsEmpty: vi.fn(), findReusableWikiHomepageSetupTurn: vi.fn() };
    const agent = { invoke: vi.fn() };
    const readOnly = createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]);

    await expect(
      runWithTenant(readOnly, () =>
        setupInteractor(repo, agent).invoke({
          homepage: "example.com",
          clientRequestId: CLIENT_REQUEST_ID,
          locale: "en",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(repo.findReusableWikiHomepageSetupTurn).not.toHaveBeenCalled();
    expect(agent.invoke).not.toHaveBeenCalled();
  });

  it("dispatches one visible, localized, domain-restricted durable Mate turn", async () => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(true),
      findReusableWikiHomepageSetupTurn: vi.fn().mockResolvedValue(null),
    };
    const outcome = {
      ok: true as const,
      data: {
        disposition: "running" as const,
        clientRequestId: CLIENT_REQUEST_ID,
        conversationId: "00000000-0000-4000-8000-000000000002",
        retryAllowed: false,
      },
    };
    const agent = { invoke: vi.fn().mockResolvedValue(outcome) };

    const result = await setupInteractor(repo, agent).invoke({
      homepage: "https://www.example.com/about?ref=onboarding#team",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "de",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        conversationId: "00000000-0000-4000-8000-000000000002",
        homepage: "https://www.example.com/about",
        domain: "example.com",
      },
    });
    expect(agent.invoke).toHaveBeenCalledOnce();
    expect(agent.invoke).toHaveBeenCalledWith({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "Informiere dich auf https://www.example.com/about über unser Unternehmen und erstelle unsere Wiki-Seiten.",
      locale: "de",
      retry: false,
      wikiHomepageSetupUrl: "https://www.example.com/about",
    });
    expect(agent.invoke.mock.calls[0][0].text).not.toContain("?ref=");
    expect(agent.invoke.mock.calls[0][0].text).not.toContain("#team");
    expect(repo.findReusableWikiHomepageSetupTurn).toHaveBeenCalledWith({
      clientRequestId: CLIENT_REQUEST_ID,
      homepageUrl: "https://www.example.com/about",
    });
  });

  it("rejects an unsafe homepage before checking or dispatching", async () => {
    const repo = { wikiIsEmpty: vi.fn(), findReusableWikiHomepageSetupTurn: vi.fn() };
    const agent = { invoke: vi.fn() };

    const result = await setupInteractor(repo, agent).invoke({
      homepage: "http://localhost/admin",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]).toMatchObject({
        params: { error: CustomErrorCode.invalidUrl },
      });
    }
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(repo.findReusableWikiHomepageSetupTurn).not.toHaveBeenCalled();
    expect(agent.invoke).not.toHaveBeenCalled();
  });

  it("rejects a non-empty Wiki without creating a conversation", async () => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(false),
      findReusableWikiHomepageSetupTurn: vi.fn().mockResolvedValue(null),
    };
    const agent = { invoke: vi.fn() };

    const result = await setupInteractor(repo, agent).invoke({
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["homepage"],
        params: { error: CustomErrorCode.wikiNotEmpty },
      });
    }
    expect(agent.invoke).not.toHaveBeenCalled();
  });

  it("reports the Assistant's exactly-once replay as the started setup", async () => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(true),
      findReusableWikiHomepageSetupTurn: vi.fn().mockResolvedValue({
        disposition: "reuse",
        clientRequestId: CLIENT_REQUEST_ID,
        text: "Persisted setup prompt.",
      }),
    };
    const replay = {
      ok: true as const,
      data: {
        disposition: "running" as const,
        clientRequestId: CLIENT_REQUEST_ID,
        conversationId: "00000000-0000-4000-8000-000000000002",
        retryAllowed: false,
      },
    };
    const agent = { invoke: vi.fn().mockResolvedValue(replay) };

    await expect(
      setupInteractor(repo, agent).invoke({
        homepage: "example.com",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "fr",
      }),
    ).resolves.toEqual({
      ok: true,
      data: { conversationId: replay.data.conversationId, homepage: "https://example.com/", domain: "example.com" },
    });
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(agent.invoke).toHaveBeenCalledWith(expect.objectContaining({ text: "Persisted setup prompt." }));
  });

  it("recovers an in-flight setup after reload without starting a duplicate turn", async () => {
    const priorRequestId = "00000000-0000-4000-8000-000000000003";
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(true),
      findReusableWikiHomepageSetupTurn: vi.fn().mockResolvedValue({
        disposition: "reuse",
        clientRequestId: priorRequestId,
        text: "Persisted active prompt.",
      }),
    };
    const agent = {
      invoke: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          disposition: "running",
          clientRequestId: priorRequestId,
          conversationId: "00000000-0000-4000-8000-000000000002",
          retryAllowed: false,
        },
      }),
    };

    await setupInteractor(repo, agent).invoke({
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
    });

    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(agent.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: priorRequestId, text: "Persisted active prompt." }),
    );
  });

  it("replays an exact completed request even when its pages make the Wiki non-empty", async () => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(false),
      findReusableWikiHomepageSetupTurn: vi.fn().mockResolvedValue({
        disposition: "reuse",
        clientRequestId: CLIENT_REQUEST_ID,
        text: "Persisted completed prompt.",
      }),
    };
    const replay = {
      ok: true as const,
      data: {
        disposition: "completedReplay" as const,
        clientRequestId: CLIENT_REQUEST_ID,
        conversationId: "00000000-0000-4000-8000-000000000002",
        assistantMessage: {
          id: "message-1",
          parts: [{ type: "text", text: "Done" }],
          createdAt: new Date(),
        },
        terminalCode: "completed" as const,
        affectedResources: ["wiki" as const],
      },
    };
    const agent = { invoke: vi.fn().mockResolvedValue(replay) };

    await expect(
      setupInteractor(repo, agent).invoke({
        homepage: "example.com",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "en",
      }),
    ).resolves.toMatchObject({ ok: true, data: { conversationId: replay.data.conversationId } });
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
  });

  it("blocks a second setup while another workspace setup is active", async () => {
    const repo = {
      wikiIsEmpty: vi.fn(),
      findReusableWikiHomepageSetupTurn: vi.fn().mockResolvedValue({ disposition: "blocked" }),
    };
    const agent = { invoke: vi.fn() };

    const result = await setupInteractor(repo, agent).invoke({
      homepage: "different.example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["homepage"],
        params: { error: CustomErrorCode.agentTurnAlreadyRunning },
      });
    }
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(agent.invoke).not.toHaveBeenCalled();
  });

  it("retries a pre-provider failure once with the same request identity", async () => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(true),
      findReusableWikiHomepageSetupTurn: vi.fn().mockResolvedValue(null),
    };
    const turn = (disposition: string, retryAllowed: boolean) => ({
      ok: true,
      data: {
        disposition,
        clientRequestId: CLIENT_REQUEST_ID,
        conversationId: "00000000-0000-4000-8000-000000000002",
        retryAllowed,
      },
    });
    const agent = {
      invoke: vi.fn().mockResolvedValueOnce(turn("failed", true)).mockResolvedValueOnce(turn("run", false)),
    };

    const result = await setupInteractor(repo, agent).invoke({
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
    });

    expect(result).toMatchObject({ ok: true, data: { domain: "example.com" } });
    expect(agent.invoke.mock.calls.map(([input]) => [input.clientRequestId, input.retry])).toEqual([
      [CLIENT_REQUEST_ID, false],
      [CLIENT_REQUEST_ID, true],
    ]);
  });

  it.each([
    ["an uncertain", { disposition: "uncertain", conversationId: "00000000-0000-4000-8000-000000000002" }],
    ["a conflicting", { disposition: "conflict" }],
    ["an at-capacity", { disposition: "atCapacity", conversationId: "00000000-0000-4000-8000-000000000002" }],
    ["a non-retryable failed", { disposition: "failed", conversationId: "00000000-0000-4000-8000-000000000002" }],
  ])("does not present %s turn as started", async (_case, outcome) => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(true),
      findReusableWikiHomepageSetupTurn: vi.fn().mockResolvedValue(null),
    };
    const agent = {
      invoke: vi.fn().mockResolvedValue({
        ok: true,
        data: { clientRequestId: CLIENT_REQUEST_ID, retryAllowed: false, ...outcome },
      }),
    };

    const result = await setupInteractor(repo, agent).invoke({
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["homepage"],
        params: { error: CustomErrorCode.wikiHomepageSetupStartFailed },
      });
    }
    expect(agent.invoke).toHaveBeenCalledOnce();
  });
});
