import { beforeEach, describe, expect, it, vi } from "vitest";

const feedback = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastZodErrorTree: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: feedback.toastError },
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: "a",
}));

vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: feedback.toastZodErrorTree,
}));

vi.mock("@/app/[locale]/(protected)/profile/actions", () => ({
  createApiKeyAction: vi.fn(),
}));

import { ClaudeSetup, executeAiConnectionKeyCreation } from "../ai-connection-flow";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeAiConnectionKeyCreation", () => {
  it("shows the fallback toast on failure and refreshes exactly once after a successful retry", async () => {
    const credential = { id: "synthetic-id", key: "one-time-secret" };
    const createKey = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValueOnce({ status: "created", credential });
    const onKeyCreated = vi.fn();

    await executeAiConnectionKeyCreation({
      createKey,
      failureMessage: "Could not create the API key. Please try again.",
      onKeyCreated,
    });

    expect(feedback.toastError).toHaveBeenCalledOnce();
    expect(onKeyCreated).not.toHaveBeenCalled();

    await executeAiConnectionKeyCreation({
      createKey,
      failureMessage: "Could not create the API key. Please try again.",
      onKeyCreated,
    });

    expect(feedback.toastError).toHaveBeenCalledOnce();
    expect(onKeyCreated).toHaveBeenCalledOnce();
    expect(onKeyCreated).toHaveBeenCalledWith(credential);
  });

  it("uses structured error feedback without adding a duplicate generic toast", async () => {
    const error = { formErrors: ["Synthetic failure"], fieldErrors: {} };
    feedback.toastZodErrorTree.mockReturnValue(true);

    await executeAiConnectionKeyCreation({
      createKey: vi.fn().mockResolvedValue({ status: "failed", error }),
      failureMessage: "Fallback",
    });

    expect(feedback.toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(feedback.toastError).not.toHaveBeenCalled();
  });
});

describe("ClaudeSetup", () => {
  it("remains observer-wrapped so the first Claude selection rerenders", () => {
    expect((ClaudeSetup as unknown as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });
});
