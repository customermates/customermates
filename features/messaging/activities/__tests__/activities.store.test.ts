import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

import { EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  getActivitiesAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: harness.toastError,
    success: vi.fn(),
  },
}));

vi.mock("@/app/[locale]/(protected)/actions", () => ({
  getActivitiesAction: harness.getActivitiesAction,
}));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

import { ActivitiesStore } from "../activities.store";

function rootStore(): RootStore {
  return {
    localeStore: { getTranslation: (key: string) => key },
    loadingOverlayStore: { isLoading: false },
  } as unknown as RootStore;
}

describe("ActivitiesStore refresh ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consumes and notifies a matching fire-and-forget refresh failure", async () => {
    const failure = new Error("offline");
    const store = new ActivitiesStore(rootStore());
    store.init(EntityType.contact, "contact-1", { items: [] });
    harness.getActivitiesAction.mockRejectedValue(failure);

    store.refreshFor("contact-1");

    await vi.waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.toastError).toHaveBeenCalledWith("Common.notifications.unexpectedError", expect.anything());
    expect(store.dataRequest).toEqual({ status: "refresh-error", error: failure });
  });

  it("does not refresh for a different entity", async () => {
    const store = new ActivitiesStore(rootStore());
    store.init(EntityType.contact, "contact-1", { items: [] });

    store.refreshFor("contact-2");

    await Promise.resolve();
    expect(harness.getActivitiesAction).not.toHaveBeenCalled();
    expect(harness.toastError).not.toHaveBeenCalled();
  });
});
