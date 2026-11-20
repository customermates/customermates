import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { AutomationRulePreview } from "@/features/automation-rules/automation-rule.schema";
import type { AutomationBuilderStore } from "../components/automation-builder.store";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("../actions", () => ({
  composeAutomationAction: vi.fn(),
  previewAutomationRuleAction: vi.fn(),
  setAutomationRuleEnabledAction: vi.fn(),
  upsertAutomationRuleAction: vi.fn(),
}));

import { AutomationPreviewPane } from "../components/automation-preview-pane";

const DEALS = "11111111-1111-4111-8111-111111111111";
const RECORD = "44444444-4444-4444-8444-444444444444";

let container: HTMLDivElement;
let root: Root;

function render(preview: AutomationRulePreview) {
  const store = {
    preview,
    previewLoading: false,
    form: { trigger: { kind: "dateReached", typeId: DEALS } },
  } as unknown as AutomationBuilderStore;
  act(() => root.render(<AutomationPreviewPane store={store} />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the preview of a date automation", () => {
  it("says that the number is a lower bound when the preview looked at only part of the records", () => {
    render({ supported: true, total: 200, recordIds: [RECORD], alreadyFired: 0, truncated: true });

    expect(container.querySelector("[data-automation-preview-count]")?.textContent).toBe(
      "Automations.preview.wouldRun:200",
    );
    expect(container.querySelector("[data-automation-preview-truncated]")?.textContent).toBe(
      "Automations.preview.truncated",
    );
  });

  it("shows no such note when every record in reach was checked", () => {
    render({ supported: true, total: 3, recordIds: [RECORD], alreadyFired: 0, truncated: false });

    expect(container.querySelector("[data-automation-preview-count]")?.textContent).toBe(
      "Automations.preview.wouldRun:3",
    );
    expect(container.querySelector("[data-automation-preview-truncated]")).toBeNull();
  });
});
