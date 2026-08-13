import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const contactActions = vi.hoisted(() => ({
  createContactByNameAction: vi.fn(),
  getContactsAction: vi.fn(),
}));

vi.mock("../../../contacts/actions", () => contactActions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ThreadParticipantsStore } from "../thread-participants.store";

function makeStore(): ThreadParticipantsStore {
  const root = {
    localeStore: { getTranslation: (key: string) => key },
    messagingThreadDetailStore: { refresh: vi.fn() },
  } as unknown as RootStore;
  return new ThreadParticipantsStore(root);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ThreadParticipantsStore search failures", () => {
  it("clears loading and supports retry without presenting a failed request as empty", async () => {
    contactActions.getContactsAction.mockRejectedValueOnce(new Error("offline"));
    const store = makeStore();
    store.activeIdentifier = "contact@example.com";
    store.query = "Ada";

    await store.retrySearch();

    expect(store.isLoading).toBe(false);
    expect(store.searchError).toBe(true);
    expect(store.showCreate).toBe(false);

    contactActions.getContactsAction.mockResolvedValueOnce({ items: [] });
    await store.retrySearch();

    expect(store.isLoading).toBe(false);
    expect(store.searchError).toBe(false);
    expect(store.showCreate).toBe(true);
  });
});
