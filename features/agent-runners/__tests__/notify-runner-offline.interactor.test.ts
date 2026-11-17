import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { NotifyRunnerOfflineInteractor } from "../notify-runner-offline.interactor";
import { AGENT_RUNNER_LIMITS } from "../agent-runner.schema";

import { COMPANY_ID, OTHER_COMPANY_ID, OWNER_ID } from "./agent-runner-fixtures";
import { FakeAgentRunnerRepo } from "./fake-agent-runner-repo";

const NOW = new Date("2026-11-17T09:20:00.000Z");
const LAST_SEEN = new Date("2026-11-17T08:40:00.000Z");
const SECOND_OWNER = "77777777-7777-4777-8777-777777777777";
const THIRD_OWNER = "88888888-8888-4888-8888-888888888888";

function setup() {
  const repo = new FakeAgentRunnerRepo();
  const notify = vi.fn().mockResolvedValue({ created: 1, emailed: 0 });
  const copy = vi.fn((locale: string) => Promise.resolve({ title: `title:${locale}`, body: `body:${locale}` }));
  const interactor = new NotifyRunnerOfflineInteractor(repo, { notify }, copy);
  return { repo, notify, copy, interactor };
}

describe("NotifyRunnerOfflineInteractor", () => {
  it("looks for runners seen in the last ten minutes", async () => {
    const { repo, interactor } = setup();

    await interactor.invoke({ now: NOW });

    expect(repo.waitingQueries).toEqual([new Date(NOW.getTime() - AGENT_RUNNER_LIMITS.offlineAfterMs)]);
    expect(new Date(NOW.getTime() - AGENT_RUNNER_LIMITS.offlineAfterMs).toISOString()).toBe("2026-11-17T09:10:00.000Z");
  });

  it("notifies nobody when no member has a job waiting without a runner that could take it", async () => {
    const { notify, interactor } = setup();

    expect(await interactor.invoke({ now: NOW })).toEqual({ runnerOfflineNotified: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells the member whose jobs wait, as a rule alert that links to the runner settings", async () => {
    const { repo, notify, interactor } = setup();
    repo.waiting = [{ companyId: COMPANY_ID, userId: OWNER_ID, displayLanguage: "en", lastSeenAt: LAST_SEEN }];

    const result = await interactor.invoke({ now: NOW });

    expect(result).toEqual({ runnerOfflineNotified: 1 });
    expect(notify).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      recipients: [OWNER_ID],
      kind: "ruleAlert",
      title: "title:en",
      body: "body:en",
      href: "/settings/connections?tab=agents",
      dedupeKey: "runner-offline:2026-11-17T08:40:00.000Z",
    });
  });

  it("notifies once for as long as the runner stays away, and again only after it was seen in between", async () => {
    const { repo, notify, interactor } = setup();
    const waiting = { companyId: COMPANY_ID, userId: OWNER_ID, displayLanguage: "en" as const };
    repo.waiting = [{ ...waiting, lastSeenAt: LAST_SEEN }];

    await interactor.invoke({ now: new Date("2026-11-17T09:00:30.000Z") });
    await interactor.invoke({ now: new Date("2026-11-17T10:05:00.000Z") });
    await interactor.invoke({ now: new Date("2026-11-18T10:05:00.000Z") });
    repo.waiting = [{ ...waiting, lastSeenAt: new Date("2026-11-18T12:00:00.000Z") }];
    await interactor.invoke({ now: new Date("2026-11-18T13:00:00.000Z") });

    expect(notify.mock.calls.map(([input]) => input.dedupeKey)).toEqual([
      "runner-offline:2026-11-17T08:40:00.000Z",
      "runner-offline:2026-11-17T08:40:00.000Z",
      "runner-offline:2026-11-17T08:40:00.000Z",
      "runner-offline:2026-11-18T12:00:00.000Z",
    ]);
  });

  it("uses one key for a member whose runner never connected", async () => {
    const { repo, notify, interactor } = setup();
    repo.waiting = [{ companyId: COMPANY_ID, userId: OWNER_ID, displayLanguage: "en", lastSeenAt: null }];

    await interactor.invoke({ now: NOW });

    expect(notify.mock.calls[0][0].dedupeKey).toBe("runner-offline:never");
  });

  it("writes the text in each member's language", async () => {
    const { repo, notify, copy, interactor } = setup();
    repo.waiting = [
      { companyId: COMPANY_ID, userId: OWNER_ID, displayLanguage: "de", lastSeenAt: null },
      { companyId: COMPANY_ID, userId: SECOND_OWNER, displayLanguage: "system", lastSeenAt: null },
      { companyId: OTHER_COMPANY_ID, userId: THIRD_OWNER, displayLanguage: "fr", lastSeenAt: null },
    ];

    const result = await interactor.invoke({ now: NOW });

    expect(result).toEqual({ runnerOfflineNotified: 3 });
    expect(copy.mock.calls.map(([locale]) => locale)).toEqual(["de", "en", "fr"]);
    expect(notify.mock.calls.map(([input]) => [input.companyId, input.recipients, input.title])).toEqual([
      [COMPANY_ID, [OWNER_ID], "title:de"],
      [COMPANY_ID, [SECOND_OWNER], "title:en"],
      [OTHER_COMPANY_ID, [THIRD_OWNER], "title:fr"],
    ]);
  });

  it("counts only notifications that were created, so a repeat reports zero", async () => {
    const { repo, notify, interactor } = setup();
    repo.waiting = [{ companyId: COMPANY_ID, userId: OWNER_ID, displayLanguage: "en", lastSeenAt: LAST_SEEN }];
    notify.mockResolvedValueOnce({ created: 1, emailed: 0 }).mockResolvedValueOnce({ created: 0, emailed: 0 });

    expect(await interactor.invoke({ now: NOW })).toEqual({ runnerOfflineNotified: 1 });
    expect(await interactor.invoke({ now: NOW })).toEqual({ runnerOfflineNotified: 0 });
  });
});
