import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectedAccountRecord } from "../../messaging.schema";

import { createMockUser } from "@/tests/helpers/mock-user";
import { defaultEmailSettings } from "../../email-settings";

const env = vi.hoisted(() => ({ APP_MODE: "cloud" }));
vi.mock("@/env", () => ({ env }));

const { GetMessagingAccountsStateInteractor } = await import("../get-messaging-accounts-state.interactor");
const { runWithTenant } = await import("@/core/decorators/tenant-context");

const account = (id: string, status: "ok" | "deleted"): ConnectedAccountRecord => ({
  id,
  provider: "google",
  status,
  hasMessaging: true,
  hasCalendar: false,
  emailAddress: null,
  displayName: id,
  shared: false,
  syncing: false,
  lastSyncedAt: null,
  createdAt: new Date(0),
  owner: { userId: "00000000-0000-4000-8000-000000000002", firstName: "Account", lastName: "Owner", avatarUrl: null },
  isOwner: true,
  folders: [],
  selectedFolderIds: [],
  foldersSyncedAt: null,
  linkedinProducts: [],
  signature: null,
  signatureFields: defaultEmailSettings(),
});
const LIVE = "00000000-0000-4000-8000-000000000011";
const GONE = "00000000-0000-4000-8000-000000000012";

const usable = { plan: "pro", status: "active", trialEndDate: null } as const;

function setup({
  read = true,
  create = false,
  subscription = usable as { plan: string; status: string; trialEndDate: Date | null },
} = {}) {
  const permissions = {
    canRead: vi.fn(() => read),
    has: vi.fn(() => create),
  };
  const repo = { listAccounts: vi.fn(() => Promise.resolve([account(LIVE, "ok"), account(GONE, "deleted")])) };
  const subscriptions = { getSubscriptionOrThrow: vi.fn(() => Promise.resolve(subscription)) };
  const interactor = new GetMessagingAccountsStateInteractor(
    repo as never,
    permissions as never,
    subscriptions as never,
  );
  return { interactor, repo, subscriptions };
}

const invoke = (interactor: InstanceType<typeof GetMessagingAccountsStateInteractor>) =>
  runWithTenant(createMockUser(), () => interactor.invoke());

beforeEach(() => {
  env.APP_MODE = "cloud";
});

describe("messaging accounts state for the Configure graph and the Inbox", () => {
  it("is unavailable on self-hosted installations without reading accounts or the subscription", async () => {
    env.APP_MODE = "self-hosted";
    const { interactor, repo, subscriptions } = setup();
    expect(await invoke(interactor)).toEqual({ ok: true, data: { state: "unavailable" } });
    expect(repo.listAccounts).not.toHaveBeenCalled();
    expect(subscriptions.getSubscriptionOrThrow).not.toHaveBeenCalled();
  });

  it("is unavailable for a role that cannot read the inbox", async () => {
    const { interactor, repo } = setup({ read: false });
    expect(await invoke(interactor)).toEqual({ ok: true, data: { state: "unavailable" } });
    expect(repo.listAccounts).not.toHaveBeenCalled();
  });

  const expired = new Date(Date.UTC(2020, 0, 1));
  it.each([
    ["a plan without messaging", { plan: "starter", status: "active", trialEndDate: null }, "plan"],
    [
      "a plan without messaging and an ended trial",
      { plan: "starter", status: "trial", trialEndDate: expired },
      "plan",
    ],
    ["an ended trial", { plan: "pro", status: "trial", trialEndDate: expired }, "subscription"],
  ])("is locked by %s without listing accounts", async (_, subscription, reason) => {
    const { interactor, repo } = setup({ subscription });
    expect(await invoke(interactor)).toEqual({ ok: true, data: { state: "locked", reason } });
    expect(repo.listAccounts).not.toHaveBeenCalled();
  });

  it("lists the visible accounts without deleted ones and reports whether the role can connect", async () => {
    const { interactor } = setup({ create: true });
    const result = await invoke(interactor);
    expect(result).toMatchObject({ ok: true, data: { state: "available", canConnect: true } });
    expect(result.ok && result.data.state === "available" && result.data.accounts.map(({ id }) => id)).toEqual([LIVE]);
  });
});
