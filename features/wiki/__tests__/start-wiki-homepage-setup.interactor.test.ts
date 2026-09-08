import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
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

beforeEach(() => vi.clearAllMocks());

describe("StartWikiHomepageSetupInteractor", () => {
  it("dispatches one visible, localized, domain-restricted durable Mate turn", async () => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(true),
      findReusableSetupRequestClientId: vi.fn().mockResolvedValue(null),
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

    const result = await new StartWikiHomepageSetupInteractor(repo, agent as never).invoke({
      homepage: "https://www.example.com/about?ref=onboarding#team",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "de",
    });

    expect(result).toBe(outcome);
    expect(agent.invoke).toHaveBeenCalledOnce();
    expect(agent.invoke).toHaveBeenCalledWith({
      clientRequestId: CLIENT_REQUEST_ID,
      text: expect.stringContaining("https://www.example.com/about"),
      locale: "de",
      retry: false,
      wikiHomepageSetupDomain: "example.com",
    });
    expect(agent.invoke.mock.calls[0][0].text).not.toContain("?ref=");
    expect(agent.invoke.mock.calls[0][0].text).not.toContain("#team");
  });

  it("rejects an unsafe homepage before checking or dispatching", async () => {
    const repo = { wikiIsEmpty: vi.fn(), findReusableSetupRequestClientId: vi.fn() };
    const agent = { invoke: vi.fn() };

    const result = await new StartWikiHomepageSetupInteractor(repo, agent as never).invoke({
      homepage: "http://localhost/admin",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues[0]).toMatchObject({ params: { error: CustomErrorCode.invalidUrl } });
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(repo.findReusableSetupRequestClientId).not.toHaveBeenCalled();
    expect(agent.invoke).not.toHaveBeenCalled();
  });

  it("rejects a non-empty Wiki without creating a conversation", async () => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(false),
      findReusableSetupRequestClientId: vi.fn().mockResolvedValue(null),
    };
    const agent = { invoke: vi.fn() };

    const result = await new StartWikiHomepageSetupInteractor(repo, agent as never).invoke({
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

  it("returns the Assistant's exactly-once replay outcome unchanged", async () => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(true),
      findReusableSetupRequestClientId: vi.fn().mockResolvedValue(CLIENT_REQUEST_ID),
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
      new StartWikiHomepageSetupInteractor(repo, agent as never).invoke({
        homepage: "example.com",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "fr",
      }),
    ).resolves.toBe(replay);
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
  });

  it("recovers an in-flight setup after reload without starting a duplicate turn", async () => {
    const priorRequestId = "00000000-0000-4000-8000-000000000003";
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(true),
      findReusableSetupRequestClientId: vi.fn().mockResolvedValue(priorRequestId),
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

    await new StartWikiHomepageSetupInteractor(repo, agent as never).invoke({
      homepage: "example.com",
      clientRequestId: CLIENT_REQUEST_ID,
      locale: "en",
    });

    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
    expect(agent.invoke).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: priorRequestId }));
  });

  it("replays an exact completed request even when its pages make the Wiki non-empty", async () => {
    const repo = {
      wikiIsEmpty: vi.fn().mockResolvedValue(false),
      findReusableSetupRequestClientId: vi.fn().mockResolvedValue(CLIENT_REQUEST_ID),
    };
    const replay = {
      ok: true as const,
      data: {
        disposition: "completedReplay" as const,
        clientRequestId: CLIENT_REQUEST_ID,
        conversationId: "00000000-0000-4000-8000-000000000002",
        assistantMessage: { id: "message-1", parts: [{ type: "text", text: "Done" }], createdAt: new Date() },
        terminalCode: "completed" as const,
        affectedResources: ["wiki" as const],
      },
    };
    const agent = { invoke: vi.fn().mockResolvedValue(replay) };

    await expect(
      new StartWikiHomepageSetupInteractor(repo, agent as never).invoke({
        homepage: "example.com",
        clientRequestId: CLIENT_REQUEST_ID,
        locale: "en",
      }),
    ).resolves.toBe(replay);
    expect(repo.wikiIsEmpty).not.toHaveBeenCalled();
  });
});
