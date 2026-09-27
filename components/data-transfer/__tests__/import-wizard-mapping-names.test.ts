import type { ReactElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

import { IMPORT_ENTITIES } from "@/features/data-transfer/import/import-entity.registry";

const harness = { store: {} as Record<string, unknown> };

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("mobx-react-lite", () => ({ observer: (component: unknown) => component }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ importWizardStore: harness.store }) }));
vi.mock("@/components/modal", () => ({
  AppModal: ({ children }: { children: ReactElement }) => createElement("div", { "data-modal": "" }, children),
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked }: { checked: boolean }) =>
    createElement("input", { type: "checkbox", defaultChecked: checked }),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactElement }) => createElement("div", { "data-select": "" }, children),
  SelectContent: ({ children }: { children: ReactElement }) => createElement("div", null, children),
  SelectGroup: ({ children }: { children: ReactElement }) => createElement("div", { "data-group": "" }, children),
  SelectLabel: ({ children }: { children: ReactElement }) => createElement("div", { "data-group-label": "" }, children),
  SelectSeparator: () => createElement("hr", { "data-group-separator": "" }),
  SelectItem: ({ children, value }: { children: ReactElement; value: string }) =>
    createElement("div", { "data-option": value }, children),
  SelectTrigger: ({
    children,
    "aria-labelledby": labelledBy,
  }: {
    children: ReactElement;
    "aria-labelledby"?: string;
  }) => createElement("button", { "aria-labelledby": labelledBy, role: "combobox", type: "button" }, children),
  SelectValue: () => null,
}));

const { ImportWizard } = await import("../import-wizard");

function stubStore(overrides: Record<string, unknown>) {
  return {
    step: "file",
    fileName: "contacts.xlsx",
    parsed: undefined,
    mapping: [],
    customColumns: [],
    plan: undefined,
    issues: [],
    summary: undefined,
    isLoading: false,
    progressDone: 0,
    progressTotal: 0,
    fileError: null,
    hasBlockingIssues: false,
    skipInvalid: false,
    skippableCount: 0,
    duplicateTargetCount: 0,
    setSkipInvalid: vi.fn(),
    descriptor: IMPORT_ENTITIES[EntityType.contact],
    setStep: vi.fn(),
    setTarget: vi.fn(),
    runDryRun: vi.fn(),
    commit: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

function render(overrides: Record<string, unknown>) {
  harness.store = stubStore(overrides);
  return renderToStaticMarkup(createElement(ImportWizard));
}

describe("ImportWizard mapping step", () => {
  it("names each target selector after the spreadsheet column it maps", () => {
    const html = render({
      step: "mapping",
      parsed: {
        sheetName: "Contacts",
        rows: [{ sourceIndex: 0, sheetRow: 2, cells: [] }],
        schemaRows: [],
        sources: [
          { index: 0, letter: "A", header: "First name", samples: [] },
          { index: 1, letter: "B", header: "", samples: [] },
        ],
      },
      mapping: [{ kind: "ignore" }, { kind: "ignore" }],
    });

    expect(html).toContain('<span class="truncate text-sm font-medium" id="import-source-0">A. First name</span>');
    expect(html).toContain('id="import-source-1">B. DataTransfer.import.unnamedColumn</span>');
    expect(html).toContain('<button aria-labelledby="import-source-0" role="combobox"');
    expect(html).toContain('<button aria-labelledby="import-source-1" role="combobox"');
  });
});
