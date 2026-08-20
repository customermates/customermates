import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ sendFeedbackAction: vi.fn() }));
const toasts = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("../../../actions", () => actions);
vi.mock("sonner", () => ({ toast: toasts }));

import { FeedbackModalStore } from "../feedback-modal.store";

const rootStore = {
  localeStore: { getTranslation: (key: string) => key },
  registerModalStore: vi.fn(),
} as unknown as RootStore;

describe("FeedbackModalStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows success only after the feedback email is accepted", async () => {
    actions.sendFeedbackAction.mockResolvedValue({
      ok: true,
      data: { feedback: "Please help.", type: "general" },
    });
    const store = new FeedbackModalStore(rootStore);
    store.open();
    store.onChange("feedback", "Please help.");

    await store.onSubmit();

    expect(toasts.success).toHaveBeenCalledWith("feedback.success", expect.anything());
    expect(toasts.error).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(false);
  });

  it("shows an error and preserves the form when email delivery is rejected", async () => {
    actions.sendFeedbackAction.mockRejectedValue(new Error("Resend rejected the email"));
    const store = new FeedbackModalStore(rootStore);
    store.open();
    store.onChange("feedback", "Please help.");

    await store.onSubmit();

    expect(toasts.error).toHaveBeenCalledWith("Common.notifications.unexpectedError", expect.anything());
    expect(toasts.success).not.toHaveBeenCalled();
    expect(store.form.feedback).toBe("Please help.");
    expect(store.isOpen).toBe(true);
    expect(store.isLoading).toBe(false);
  });
});
