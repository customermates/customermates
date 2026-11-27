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
  useTranslations: () =>
    Object.assign(
      (key: string) => {
        const provider = key.split(".").at(-1);
        const labels: Record<string, string> = {
          claude: "Claude",
          chatgpt: "ChatGPT",
          codex: "Codex",
          cursor: "Cursor",
          gemini: "Gemini",
          grok: "Grok",
          langdock: "Langdock",
          openai: "ChatGPT & Codex",
        };

        return labels[provider ?? ""] ?? key;
      },
      { rich: (key: string) => key },
    ),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: "a",
}));

vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: feedback.toastZodErrorTree,
}));

vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/actions", () => ({
  createApiKeyAction: vi.fn(),
}));

import { AiConnectionAppSetup } from "../ai-connection-app-setup";
import { AiConnectionClaudeSetup } from "../ai-connection-claude-setup";
import { AiConnectionConnectorSetup } from "../ai-connection-connector-setup";
import { executeAiConnectionKeyCreation } from "../ai-connection-key-creation";
import { AiConnectionOpenAiSetup } from "../ai-connection-openai-setup";
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

describe("AiConnectionConnectorSetup", () => {
  const ACCOUNT_URL = "https://app.example/api/v1/mcp";

  it("pre-fills Claude with the account-wide URL and the plain connector name", () => {
    const html = renderToStaticMarkup(
      createElement(AiConnectionConnectorSetup, { mcpUrl: ACCOUNT_URL, provider: "claude" }),
    );
    const href = html.match(/href="(https:\/\/claude\.ai[^"]*)"/)?.[1]?.replaceAll("&amp;", "&") ?? "";
    const link = new URL(href);

    expect(link.searchParams.get("connectorUrl")).toBe(ACCOUNT_URL);
    expect(link.searchParams.get("connectorName")).toBe("Customermates");
    expect(html).toContain("OnboardingWizard.ai.connector.workspaceNote");
    expect(html).not.toContain("/api/v1/mcp/w/");
  });

  it("shows the same account-wide URL for apps without a quick button", () => {
    const html = renderToStaticMarkup(
      createElement(AiConnectionAppSetup, { mcpUrl: ACCOUNT_URL, provider: "langdock" }),
    );

    expect(html).toContain(ACCOUNT_URL);
    expect(html).toContain("OnboardingWizard.ai.connector.workspaceNote");
  });
});

describe("AiConnectionClaudeSetup", () => {
  it("remains observer-wrapped so the first Claude selection rerenders", () => {
    expect((AiConnectionClaudeSetup as unknown as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });
});

describe("AiConnectionOpenAiSetup", () => {
  it("remains observer-wrapped so method and key selections rerender", () => {
    expect((AiConnectionOpenAiSetup as unknown as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });
});

describe("AiConnectionProviderGrid", () => {
  it("renders the six quick connections as one list of rows with ChatGPT and Codex merged", () => {
    const html = renderToStaticMarkup(
      createElement(AiConnectionProviderGrid, {
        disabled: false,
        onSelect: vi.fn(),
        registerRef: vi.fn(),
      }),
    );

    expect(html).toContain("rounded-xl border bg-card shadow-xs");
    expect(html.match(/data-provider=/g)).toHaveLength(6);

    for (const provider of ["claude", "openai", "cursor", "gemini", "grok", "langdock"])
      expect(html).toContain(`data-provider="${provider}"`);

    for (const label of ["Claude", "ChatGPT &amp; Codex", "Cursor", "Gemini", "Grok", "Langdock"])
      expect(html).toContain(`>${label}</span>`);

    expect(html).not.toContain('data-provider="chatgpt"');
    expect(html).not.toContain('data-provider="codex"');

    expect(html).not.toContain("truncate");
    expect(html).not.toContain("overflow-hidden");
  });
});
