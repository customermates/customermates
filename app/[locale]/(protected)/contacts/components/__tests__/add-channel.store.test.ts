import type { RootStore } from "@/core/stores/root.store";
import type { IdentifierInput } from "@/features/contacts/contact.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingProvider } from "@/generated/prisma";

const contactActions = vi.hoisted(() => ({
  checkChannelConflictAction: vi.fn(),
  getContactsAction: vi.fn(),
  searchChannelCandidatesAction: vi.fn(),
}));
const inboxActions = vi.hoisted(() => ({ resolveProviderProfileAction: vi.fn() }));

vi.mock("../../actions", () => contactActions);
vi.mock("../../../inbox/actions", () => inboxActions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AddChannelStore } from "../add-channel.store";

function makeStore(channels: IdentifierInput[]): AddChannelStore {
  const root = {
    contactDetailStore: { channels, addChannel: vi.fn() },
    connectedAccountsStore: { ensureLoaded: vi.fn(), usableSendersFor: () => [] },
    userStore: { user: null, can: () => true, canManage: () => true, canAccess: () => true },
  } as unknown as RootStore;
  return new AddChannelStore(root);
}

const EMAIL = "shared@example.com";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddChannelStore.addAsNewOptions", () => {
  it("offers Mail for an address the contact does not have", () => {
    const store = makeStore([]);
    store.query = EMAIL;

    expect(store.addAsNewOptions).toEqual([MessagingProvider.mail]);
  });

  it("suppresses Mail when the contact already holds the address under google", () => {
    const store = makeStore([{ provider: MessagingProvider.google, value: EMAIL }]);
    store.query = EMAIL;

    expect(store.addAsNewOptions).toEqual([]);
  });

  it("suppresses Mail when the contact already holds the address under outlook", () => {
    const store = makeStore([{ provider: MessagingProvider.outlook, value: EMAIL }]);
    store.query = EMAIL;

    expect(store.addAsNewOptions).toEqual([]);
  });

  it("suppresses Mail when the contact already holds the address under mail", () => {
    const store = makeStore([{ provider: MessagingProvider.mail, value: EMAIL }]);
    store.query = EMAIL;

    expect(store.addAsNewOptions).toEqual([]);
  });

  it("still offers Mail when the contact holds a different address", () => {
    const store = makeStore([{ provider: MessagingProvider.google, value: "someone-else@example.com" }]);
    store.query = EMAIL;

    expect(store.addAsNewOptions).toEqual([MessagingProvider.mail]);
  });

  it("suppresses WhatsApp when the contact already holds the number", () => {
    const store = makeStore([{ provider: MessagingProvider.whatsapp, value: "+4915150799170" }]);
    store.query = "+4915150799170";

    expect(store.addAsNewOptions).toEqual([]);
  });

  it("does not suppress a handle that merely matches another provider's handle", () => {
    const store = makeStore([{ provider: MessagingProvider.telegram, value: "jane" }]);
    store.query = "jane";

    expect(store.addAsNewOptions).toContain(MessagingProvider.linkedin);
    expect(store.addAsNewOptions).not.toContain(MessagingProvider.telegram);
  });
});

describe("AddChannelStore.contactChannelKeys", () => {
  it("keys staged channels by channel class so email providers collapse", () => {
    const store = makeStore([
      { provider: MessagingProvider.google, value: EMAIL },
      { provider: MessagingProvider.whatsapp, value: "+4915150799170" },
    ]);

    expect([...store.contactChannelKeys]).toEqual([`email:${EMAIL}`, "phone:+4915150799170"]);
  });
});

describe("AddChannelStore search failures", () => {
  it("clears pending geometry and retries a failed search", async () => {
    contactActions.searchChannelCandidatesAction.mockRejectedValueOnce(new Error("offline"));
    contactActions.getContactsAction.mockResolvedValue({ items: [] });
    const store = makeStore([]);
    store.query = EMAIL;

    await store.retrySearch();

    expect(store.isSearching).toBe(false);
    expect(store.isResolving).toBe(false);
    expect(store.searchError).toBe(true);

    contactActions.searchChannelCandidatesAction.mockResolvedValueOnce([]);
    await store.retrySearch();

    expect(store.isSearching).toBe(false);
    expect(store.searchError).toBe(false);
  });
});
