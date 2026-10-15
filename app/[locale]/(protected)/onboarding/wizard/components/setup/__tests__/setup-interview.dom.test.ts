import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
  useLocale: () => "en",
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: unknown }) => children,
  Tooltip: ({ children }: { children: unknown }) => children,
  TooltipTrigger: ({ children }: { children: unknown }) => children,
  TooltipContent: () => null,
}));
vi.mock("@/components/forms/form-context", () => ({ useAppForm: () => undefined }));
vi.mock("@/components/forms/form-autocomplete-country", () => ({ FormAutocompleteCountry: () => null }));
vi.mock("@/components/forms/form-autocomplete-currency", () => ({ FormAutocompleteCurrency: () => null }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("../../../workspace-setup-actions", () => ({}));

import { SETUP_SCREENS } from "@/features/workspace-setup/setup-interview";

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupInterview } from "../setup-interview";
import { setupView } from "./setup-view-fixture";

let container: HTMLDivElement;
let root: Root;

function renderDataScreen(existingData: string) {
  const store = new WorkspaceSetupStore({} as never);
  store.hydrate({ available: true, setup: setupView() });
  runInAction(() => {
    store.screenIndex = SETUP_SCREENS.indexOf("data");
  });
  store.setAnswer("existingData", { format: "singleChoice", value: existingData });
  harness.rootStore = { workspaceSetupStore: store };
  act(() => root.render(createElement(SetupInterview)));
}

function field(id: string) {
  const found = container.querySelector<HTMLElement>(`[aria-labelledby="setup-question-${id}"]`);
  if (!found) throw new Error(`Field ${id} did not render.`);
  return found;
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

describe("SetupInterview", () => {
  it("puts the spreadsheet upload right under the choice that asks for it", () => {
    renderDataScreen("spreadsheet");

    const upload = field("existingData").nextElementSibling;
    expect(upload?.querySelector("#setup-spreadsheet")).not.toBeNull();
    expect(upload?.nextElementSibling).toBe(field("anythingMissed"));
  });

  it("asks for no spreadsheet when the workspace starts with sample data", () => {
    renderDataScreen("sampleData");

    expect(container.querySelector("#setup-spreadsheet")).toBeNull();
    expect(field("existingData").nextElementSibling).toBe(field("anythingMissed"));
  });
});
