import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const feedback = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastZodErrorTree: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: feedback.toastError },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const provider = key.split(".").at(-1);
    const labels: Record<string, string> = {
      claude: "Claude",
      chatgpt: "ChatGPT",
      codex: "Codex",
      cursor: "Cursor",
      gemini: "Gemini",
    };

    return labels[provider ?? ""] ?? key;
  },
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

import { AiConnectionClaudeSetup } from "../ai-connection-claude-setup";
import { executeAiConnectionKeyCreation } from "../ai-connection-key-creation";
import { AiConnectionProviderGrid } from "../ai-connection-provider-grid";

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

describe("AiConnectionClaudeSetup", () => {
  it("remains observer-wrapped so the first Claude selection rerenders", () => {
    expect((AiConnectionClaudeSetup as unknown as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });
});

describe("AiConnectionProviderGrid", () => {
  it("renders the five quick connections in a balanced responsive two-row grid", () => {
    const html = renderToStaticMarkup(
      createElement(AiConnectionProviderGrid, {
        disabled: false,
        onSelect: vi.fn(),
        registerRef: vi.fn(),
        selectedProvider: null,
      }),
    );

    expect(html).toContain("sm:grid-cols-6");
    expect(html).not.toContain("sm:grid-cols-5");
    expect(html.match(/sm:col-span-2/g)).toHaveLength(3);
    expect(html.match(/sm:col-span-3/g)).toHaveLength(2);

    for (const provider of ["claude", "chatgpt", "codex", "cursor", "gemini"])
      expect(html).toContain(`data-provider="${provider}"`);

    for (const label of ["Claude", "ChatGPT", "Codex", "Cursor", "Gemini"]) expect(html).toContain(`>${label}</span>`);

    expect(html).not.toContain("truncate");
    expect(html).not.toContain("overflow-hidden");
  });
});
