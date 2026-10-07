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

function setup({ read = true, create = false, denial = null as null | { code: string } } = {}) {
  const permissions = {
    canRead: vi.fn(() => read),
    has: vi.fn(() => create),
  };
  const repo = { listAccounts: vi.fn(() => Promise.resolve([account(LIVE, "ok"), account(GONE, "deleted")])) };
  const entitlements = { require: vi.fn(() => Promise.resolve(denial)) };
  const interactor = new GetMessagingAccountsStateInteractor(
    repo as never,
    permissions as never,
    entitlements as never,
  );
  return { interactor, repo, entitlements };
}

const invoke = (interactor: InstanceType<typeof GetMessagingAccountsStateInteractor>) =>
  runWithTenant(createMockUser(), () => interactor.invoke());

beforeEach(() => {
  env.APP_MODE = "cloud";
});

describe("messaging accounts state for the Configure graph and the Inbox", () => {
  it("is unavailable on self-hosted installations without reading accounts or the subscription", async () => {
    env.APP_MODE = "self-hosted";
    const { interactor, repo, entitlements } = setup();
    expect(await invoke(interactor)).toEqual({ ok: true, data: { state: "unavailable" } });
    expect(repo.listAccounts).not.toHaveBeenCalled();
    expect(entitlements.require).not.toHaveBeenCalled();
  });

  it("is unavailable for a role that cannot read the inbox", async () => {
    const { interactor, repo } = setup({ read: false });
    expect(await invoke(interactor)).toEqual({ ok: true, data: { state: "unavailable" } });
    expect(repo.listAccounts).not.toHaveBeenCalled();
  });

  it.each([
    ["messagingRequiresPro", "plan"],
    ["paidSubscriptionRequired", "subscription"],
  ])("is locked by the %s entitlement denial without listing accounts", async (code, reason) => {
    const { interactor, repo } = setup({ denial: { code } });
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
