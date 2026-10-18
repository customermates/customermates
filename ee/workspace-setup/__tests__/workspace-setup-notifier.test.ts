import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import type { WorkspaceSetupRecord } from "../workspace-setup.schema";

import { Locale } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SETUP_COMPANY_ID } from "@/features/workspace-setup/__tests__/setup-harness";
import { createMockUser } from "@/tests/helpers/mock-user";

import {
  StoredSetupCreatedSchema,
  StoredSetupInterviewSchema,
  StoredSetupResultsSchema,
} from "../workspace-setup.schema";
import { SETUP_AWAY_MS, WorkspaceSetupNotifier, setupNotice } from "../workspace-setup-notifier";

const owner = createMockUser({ companyId: SETUP_COMPANY_ID, firstName: "Mara", displayLanguage: Locale.de });
const now = new Date("2026-10-18T09:00:00.000Z");

function setupWith(overrides: Partial<WorkspaceSetupRecord>, watchedAt: string | null = null): WorkspaceSetupRecord {
  return {
    id: "setup-1",
    userId: owner.id,
    status: "planned",
    websiteUrl: null,
    crawlId: null,
    answers: {},
    interview: StoredSetupInterviewSchema.parse({ watchedAt }),
    plan: null,
    planRevision: 1,
    phases: {},
    artifacts: {},
    created: StoredSetupCreatedSchema.parse({}),
    results: StoredSetupResultsSchema.parse({}),
    spreadsheetName: null,
    hasSpreadsheet: false,
    startedAt: now,
    confirmedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function notifyWith(setup: WorkspaceSetupRecord, stage: "plan" | "build") {
  const email = { send: vi.fn(() => Promise.resolve(true)) };
  const notifier = new WorkspaceSetupNotifier({ get: () => Promise.resolve(setup) }, email);
  return runWithTenant(owner, async () => ({ notice: await notifier.notify(setup.id, stage, now), email }));
}

describe("workspace setup notifier", () => {
  it("names the notice for each settled setup", () => {
    const interview = StoredSetupInterviewSchema.parse({});
    expect(setupNotice({ status: "planned", interview })).toBe("planReady");
    expect(setupNotice({ status: "interview", interview: { ...interview, plan: "failed" } })).toBe("planFailed");
    expect(setupNotice({ status: "completed", interview })).toBe("workspaceReady");
    expect(setupNotice({ status: "failed", interview })).toBe("workspaceFailed");
    expect(setupNotice({ status: "planning", interview })).toBeNull();
  });

  it("emails a ready plan in the owner's language when nobody watched the page", async () => {
    const away = new Date(now.getTime() - SETUP_AWAY_MS - 1_000).toISOString();
    const { notice, email } = await notifyWith(setupWith({}, away), "plan");
    expect(notice).toBe("planReady");
    expect(email.send).toHaveBeenCalledTimes(1);
    const [message] = email.send.mock.calls[0] as unknown as [
      { to: string; subject: string; react: { props: Record<string, string> } },
    ];
    expect(message.to).toBe(owner.email);
    expect(message.subject).toBe("Der Plan für deinen Workspace ist fertig");
    expect(message.react.props.greeting).toBe("Hallo Mara,");
    expect(message.react.props.href).toMatch(/\/de\/onboarding\/wizard$/u);
  });

  it("sends nothing while the owner watches the page", async () => {
    const watching = new Date(now.getTime() - 5_000).toISOString();
    const { notice, email } = await notifyWith(setupWith({}, watching), "plan");
    expect(notice).toBeNull();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("sends only the notice of the stage that finished", async () => {
    const { notice, email } = await notifyWith(setupWith({ status: "completed" }), "plan");
    expect(notice).toBeNull();
    expect(email.send).not.toHaveBeenCalled();
    const built = await notifyWith(setupWith({ status: "failed" }), "build");
    expect(built.notice).toBe("workspaceFailed");
  });
});
