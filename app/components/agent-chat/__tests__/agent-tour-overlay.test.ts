import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: vi.fn() }));
vi.mock("../ui-control.store", () => ({ findAgentTargetElement: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AgentTourNote } from "../agent-tour-overlay";

describe("AgentTourNote", () => {
  it("renders Markdown formatting in model-written tour notes", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentTourNote, {
        note: "Open **Company → Roles** to create or update permission sets.",
      }),
    );

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('data-streamdown="strong"');
    expect(markup).toContain("Company → Roles");
    expect(markup).not.toContain("**Company → Roles**");
  });
});
