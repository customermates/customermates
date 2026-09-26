import { afterEach, describe, expect, it, vi } from "vitest";
import { observable, runInAction } from "mobx";

import { EntityType, TaskType } from "@/generated/prisma";

vi.mock("@/app/[locale]/(protected)/search/actions", () => ({
  checkSearchResultExistsAction: vi.fn(),
  globalSearchAction: vi.fn(),
}));

import { checkSearchResultExistsAction } from "@/app/[locale]/(protected)/search/actions";

import { GlobalSearchModalStore } from "../global-search-modal.store";

const FIRST_KEY = "customermates:globalSearch:recent:v2:company-1:user-1";
const SECOND_KEY = "customermates:globalSearch:recent:v2:company-1:user-2";
const LEGACY_KEY = "customermates:globalSearch:recent:v1";
const CONTACT_ID = "10000000-0000-4000-8000-000000000001";
const DEAL_ID = "20000000-0000-4000-8000-000000000001";
const TASK_ID = "30000000-0000-4000-8000-000000000001";

type UserIdentity = { id: string; companyId: string } | null;

function recent(type: EntityType, id: string, name: string, openedAt: number, taskType?: TaskType) {
  return {
    type,
    id,
    name,
    pictureUrl: null,
    ...(taskType ? { taskType } : {}),
    openedAt,
  };
}

function stubBrowser(initial: Readonly<Record<string, unknown>>) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  return values;
}

function root(userStore: { user: UserIdentity }) {
  return {
    userStore,
    localeStore: { getTranslation: (key: string) => key },
    registerModalStore: vi.fn(),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("GlobalSearchModalStore recent searches", () => {
  it("isolates recent items by company and user and swaps them when the active identity changes", () => {
    stubBrowser({
      [FIRST_KEY]: [recent(EntityType.contact, CONTACT_ID, "Ada Lovelace", 1)],
      [SECOND_KEY]: [recent(EntityType.deal, DEAL_ID, "Renewal", 2)],
      [LEGACY_KEY]: [recent(EntityType.task, TASK_ID, "Legacy task", 3, TaskType.userPendingAuthorization)],
    });
    const userStore = observable<{ user: UserIdentity }>({
      user: { id: "user-1", companyId: "company-1" },
    });
    const store = new GlobalSearchModalStore(root(userStore) as never);

    expect(store.recentItems).toEqual([recent(EntityType.contact, CONTACT_ID, "Ada Lovelace", 1)]);

    runInAction(() => {
      userStore.user = { id: "user-2", companyId: "company-1" };
    });

    expect(store.recentItems).toEqual([recent(EntityType.deal, DEAL_ID, "Renewal", 2)]);
  });

  it("writes and clears only the active identity's scoped key", () => {
    const values = stubBrowser({
      [SECOND_KEY]: [recent(EntityType.deal, DEAL_ID, "Other user", 2)],
      [LEGACY_KEY]: [recent(EntityType.task, TASK_ID, "Legacy task", 3, TaskType.userPendingAuthorization)],
    });
    const store = new GlobalSearchModalStore(root({ user: { id: "user-1", companyId: "company-1" } }) as never);

    store.pushRecentItem({
      type: EntityType.contact,
      id: CONTACT_ID,
      name: "Ada Lovelace",
      pictureUrl: null,
    });

    expect(JSON.parse(values.get(FIRST_KEY) ?? "[]")).toEqual([
      expect.objectContaining({
        type: EntityType.contact,
        id: CONTACT_ID,
        name: "Ada Lovelace",
      }),
    ]);
    expect(JSON.parse(values.get(SECOND_KEY) ?? "[]")).toEqual([recent(EntityType.deal, DEAL_ID, "Other user", 2)]);
    expect(values.has(LEGACY_KEY)).toBe(true);

    store.clearRecentItems();
    expect(JSON.parse(values.get(FIRST_KEY) ?? "null")).toEqual([]);
    expect(JSON.parse(values.get(SECOND_KEY) ?? "[]")).toHaveLength(1);
  });

  it("drops malformed and unknown cached entries before exposing them to the modal", () => {
    stubBrowser({
      [FIRST_KEY]: [
        recent(EntityType.task, TASK_ID, "Authorization", 1, TaskType.userPendingAuthorization),
        {
          ...recent(EntityType.contact, CONTACT_ID, "Unknown", 2),
          type: "unknown",
        },
        { ...recent(EntityType.contact, "not-a-uuid", "Bad id", 3) },
        {
          ...recent(EntityType.deal, DEAL_ID, "Bad avatar", 4),
          pictureUrl: 42,
        },
      ],
    });

    const store = new GlobalSearchModalStore(root({ user: { id: "user-1", companyId: "company-1" } }) as never);

    expect(store.recentItems).toEqual([
      recent(EntityType.task, TASK_ID, "Authorization", 1, TaskType.userPendingAuthorization),
    ]);
  });

  it("removes only the stale entity when different record types share an id", () => {
    stubBrowser({
      [FIRST_KEY]: [
        recent(EntityType.contact, CONTACT_ID, "Ada Lovelace", 1),
        recent(EntityType.deal, CONTACT_ID, "Same UUID deal", 2),
      ],
    });
    const store = new GlobalSearchModalStore(root({ user: { id: "user-1", companyId: "company-1" } }) as never);

    store.removeRecentItem(CONTACT_ID, EntityType.contact);

    expect(store.recentItems).toEqual([recent(EntityType.deal, CONTACT_ID, "Same UUID deal", 2)]);
  });

  it("ignores a delayed existence result after the active identity changes", async () => {
    const values = stubBrowser({
      [FIRST_KEY]: [recent(EntityType.contact, CONTACT_ID, "Ada Lovelace", 1)],
      [SECOND_KEY]: [recent(EntityType.contact, CONTACT_ID, "Other user's contact", 2)],
    });
    const userStore = observable<{ user: UserIdentity }>({
      user: { id: "user-1", companyId: "company-1" },
    });
    let resolveExists!: (exists: boolean) => void;
    vi.mocked(checkSearchResultExistsAction).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExists = resolve;
      }),
    );
    const store = new GlobalSearchModalStore(root(userStore) as never);

    const verifying = store.verifyRecentItem(store.recentItems[0]);
    runInAction(() => {
      userStore.user = { id: "user-2", companyId: "company-1" };
    });
    resolveExists(false);

    await expect(verifying).resolves.toBe(false);
    expect(store.recentItems).toEqual([recent(EntityType.contact, CONTACT_ID, "Other user's contact", 2)]);
    expect(JSON.parse(values.get(SECOND_KEY) ?? "[]")).toEqual([
      recent(EntityType.contact, CONTACT_ID, "Other user's contact", 2),
    ]);
  });
});
