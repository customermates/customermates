import { describe, expect, it, vi } from "vitest";

const template = vi.hoisted(() => vi.fn((props: unknown) => ({ type: "plan-pause-notice", props })));

vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));
vi.mock("@/components/emails/plan-pause-notice", () => ({ default: template }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud", BASE_URL: "https://app.example.test" } }));

import type { FreePlanMemberRepo, PlanPauseNoticeRecipient } from "../free-plan-member.repo";
import type { FreePlanPauseService } from "../free-plan-pause.service";

import { Locale } from "@/generated/prisma";

import { SyncFreePlanPausesInteractor } from "../sync-free-plan-pauses.interactor";

const NOW = new Date("2026-11-07T12:00:00.000Z");

function recipient(id: string, overrides: Partial<PlanPauseNoticeRecipient> = {}): PlanPauseNoticeRecipient {
  return {
    id,
    companyId: "co-1",
    email: `${id}@example.test`,
    firstName: "Sofia",
    displayLanguage: Locale.de,
    workspaceName: "Northwind Studio",
    ...overrides,
  };
}

describe("syncing Free plan pauses", () => {
  it("syncs every workspace over the limit or with plan pauses once and sends each paused member one email", async () => {
    const claimed = new Set<string>();
    const findWorkspacesOverFreePlanUnscoped = vi.fn().mockResolvedValue(["co-1", "co-2"]);
    const repo = {
      findWorkspacesOverFreePlanUnscoped,
      findWorkspacesWithPlanPausesUnscoped: vi.fn().mockResolvedValue(["co-2", "co-3"]),
      findPauseNoticeRecipientsUnscoped: vi.fn().mockResolvedValue([recipient("u-1"), recipient("u-2")]),
      claimPauseNoticeUnscoped: vi.fn((id: string) => {
        if (claimed.has(id) || id === "u-2") return Promise.resolve(false);
        claimed.add(id);
        return Promise.resolve(true);
      }),
      findActiveKeeperNameUnscoped: vi.fn().mockResolvedValue("Alex Morgan"),
    } as unknown as FreePlanMemberRepo;
    const syncUnscoped = vi.fn((companyId: string) =>
      Promise.resolve({
        paused: companyId === "co-1" ? 2 : 0,
        resumed: companyId === "co-3" ? 1 : 0,
        routinesPaused: 0,
        routinesResumed: 0,
      }),
    );
    const pauses = { syncUnscoped } as unknown as FreePlanPauseService;
    const send = vi.fn().mockResolvedValue(true);

    const result = await new SyncFreePlanPausesInteractor(repo, pauses, { send } as never).invoke({ now: NOW });

    expect(result).toEqual({ workspaces: 3, paused: 2, resumed: 1, notified: 1 });
    expect(syncUnscoped).toHaveBeenCalledTimes(3);
    expect(findWorkspacesOverFreePlanUnscoped).toHaveBeenCalledWith(NOW, 1);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      to: "u-1@example.test",
      subject: "Dein Zugang zu „Northwind Studio“ ist pausiert",
    });
    expect(template.mock.calls[0]?.[0]).toMatchObject({
      locale: "de",
      body: expect.stringContaining("Bitte Alex Morgan, Starter zu wählen"),
      href: "https://app.example.test/auth/signin",
    });
  });

  it("releases the notice claim when the email could not be sent, so the next run retries it", async () => {
    const releasePauseNoticeUnscoped = vi.fn().mockResolvedValue(undefined);
    const repo = {
      findWorkspacesOverFreePlanUnscoped: vi.fn().mockResolvedValue([]),
      findWorkspacesWithPlanPausesUnscoped: vi.fn().mockResolvedValue([]),
      findPauseNoticeRecipientsUnscoped: vi.fn().mockResolvedValue([recipient("u-1")]),
      claimPauseNoticeUnscoped: vi.fn().mockResolvedValue(true),
      releasePauseNoticeUnscoped,
      findActiveKeeperNameUnscoped: vi.fn().mockResolvedValue("Alex Morgan"),
    } as unknown as FreePlanMemberRepo;
    const pauses = { syncUnscoped: vi.fn() } as unknown as FreePlanPauseService;
    const send = vi.fn().mockResolvedValue(false);

    const result = await new SyncFreePlanPausesInteractor(repo, pauses, { send } as never).invoke({ now: NOW });

    expect(result.notified).toBe(0);
    expect(releasePauseNoticeUnscoped).toHaveBeenCalledWith("u-1");
  });

  it("keeps syncing the other workspaces when one fails", async () => {
    const repo = {
      findWorkspacesOverFreePlanUnscoped: vi.fn().mockResolvedValue(["co-1", "co-2"]),
      findWorkspacesWithPlanPausesUnscoped: vi.fn().mockResolvedValue([]),
      findPauseNoticeRecipientsUnscoped: vi.fn().mockResolvedValue([]),
    } as unknown as FreePlanMemberRepo;
    const pauses = {
      syncUnscoped: vi
        .fn()
        .mockRejectedValueOnce(new Error("lock timeout"))
        .mockResolvedValueOnce({ paused: 1, resumed: 0, routinesPaused: 0, routinesResumed: 0 }),
    } as unknown as FreePlanPauseService;

    expect(
      await new SyncFreePlanPausesInteractor(repo, pauses, { send: vi.fn() } as never).invoke({ now: NOW }),
    ).toEqual({
      workspaces: 2,
      paused: 1,
      resumed: 0,
      notified: 0,
    });
  });

  it("syncs only the named workspace and mails only its paused members when a workspace is given", async () => {
    const findWorkspacesOverFreePlanUnscoped = vi.fn();
    const findPauseNoticeRecipientsUnscoped = vi.fn().mockResolvedValue([]);
    const syncUnscoped = vi.fn().mockResolvedValue({ paused: 2, resumed: 0, routinesPaused: 1, routinesResumed: 0 });
    const repo = {
      findWorkspacesOverFreePlanUnscoped,
      findWorkspacesWithPlanPausesUnscoped: findWorkspacesOverFreePlanUnscoped,
      findPauseNoticeRecipientsUnscoped,
    } as unknown as FreePlanMemberRepo;

    const result = await new SyncFreePlanPausesInteractor(
      repo,
      { syncUnscoped } as unknown as FreePlanPauseService,
      { send: vi.fn() } as never,
    ).invoke({ now: NOW, companyIds: ["co-9"] });

    expect(result).toEqual({ workspaces: 1, paused: 2, resumed: 0, notified: 0 });
    expect(findWorkspacesOverFreePlanUnscoped).not.toHaveBeenCalled();
    expect(syncUnscoped).toHaveBeenCalledWith("co-9", NOW);
    expect(findPauseNoticeRecipientsUnscoped).toHaveBeenCalledWith(200, ["co-9"]);
  });
});
