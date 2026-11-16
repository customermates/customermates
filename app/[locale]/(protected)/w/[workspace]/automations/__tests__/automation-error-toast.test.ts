import { beforeEach, describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => ({
  toast: { error: vi.fn(), dismiss: vi.fn(), success: vi.fn() },
}));

vi.mock("sonner", () => sonner);

import {
  AUTOMATION_ERROR_TOAST_ID,
  dismissAutomationError,
  showAutomationError,
  showAutomationSaveError,
} from "../components/automation-error-toast";

describe("automation error toast", () => {
  beforeEach(() => {
    sonner.toast.error.mockClear();
    sonner.toast.dismiss.mockClear();
    sonner.toast.success.mockClear();
  });

  it("shows the incomplete message under the builder id so a later save can replace it", () => {
    showAutomationError("Fill in the highlighted fields");

    expect(sonner.toast.error).toHaveBeenCalledWith("Fill in the highlighted fields", {
      id: AUTOMATION_ERROR_TOAST_ID,
    });
  });

  it("shows a refused save under the same id", () => {
    showAutomationSaveError({ errors: ["Plan limit reached"] });

    expect(sonner.toast.error).toHaveBeenCalledWith("Plan limit reached", { id: AUTOMATION_ERROR_TOAST_ID });
  });

  it("dismisses only its own toast and never every toast", () => {
    dismissAutomationError();

    expect(sonner.toast.dismiss).toHaveBeenCalledTimes(1);
    expect(sonner.toast.dismiss).toHaveBeenCalledWith(AUTOMATION_ERROR_TOAST_ID);
  });
});
