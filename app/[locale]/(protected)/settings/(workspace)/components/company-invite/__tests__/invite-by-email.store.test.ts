import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getOrCreateInviteTokenAction: vi.fn(),
  inviteUsersByEmailAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../../../actions", () => actions);
vi.mock("sonner", () => ({ toast }));

import { InviteByEmailStore } from "../invite-by-email.store";

const rootStore = {
  localeStore: {
    getTranslation: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  },
} as unknown as RootStore;

function storeWith(emails: string[]) {
  const store = new InviteByEmailStore(rootStore);
  store.onInitOrRefresh({ emails });
  return store;
}

describe("InviteByEmailStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms and clears the form when every invitation was sent", async () => {
    actions.inviteUsersByEmailAction.mockResolvedValue({ ok: true, data: { sent: 2, failed: 0, failedEmails: [] } });
    const store = storeWith(["a@example.com", "b@example.com"]);

    await store.onSubmit();

    expect(toast.success).toHaveBeenCalledWith('OnboardingWizard.invite.sentSuccess {"count":2}', expect.anything());
    expect(toast.error).not.toHaveBeenCalled();
    expect(store.form.emails).toEqual([]);
  });

  it("reports unsent invitations instead of a success and keeps the addresses", async () => {
    actions.inviteUsersByEmailAction.mockResolvedValue({
      ok: true,
      data: { sent: 0, failed: 2, failedEmails: ["a@example.com", "b@example.com"] },
    });
    const store = storeWith(["a@example.com", "b@example.com"]);

    await store.onSubmit();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('OnboardingWizard.invite.sendFailed {"sent":0,"failed":2}', {
      description: "OnboardingWizard.invite.sendFailedDescription",
      action: undefined,
    });
    expect(store.form.emails).toEqual(["a@example.com", "b@example.com"]);
  });

  it("names both counts when only some invitations were sent and keeps only the unsent addresses", async () => {
    actions.inviteUsersByEmailAction.mockResolvedValue({
      ok: true,
      data: { sent: 1, failed: 1, failedEmails: ["b@example.com"] },
    });
    const store = storeWith(["a@example.com", "b@example.com"]);

    await store.onSubmit();

    expect(toast.error).toHaveBeenCalledWith(
      'OnboardingWizard.invite.sendPartlyFailed {"sent":1,"failed":1}',
      expect.objectContaining({ description: "OnboardingWizard.invite.sendFailedDescription" }),
    );
    expect(store.form.emails).toEqual(["b@example.com"]);
  });
});
