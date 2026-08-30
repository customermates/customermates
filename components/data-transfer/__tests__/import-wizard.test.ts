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
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactElement }) => createElement("div", { "data-select": "" }, children),
  SelectContent: ({ children }: { children: ReactElement }) => createElement("div", null, children),
  SelectItem: ({ children, value }: { children: ReactElement; value: string }) =>
    createElement("div", { "data-option": value }, children),
  SelectTrigger: ({ children }: { children: ReactElement }) => createElement("div", null, children),
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
    isBusy: false,
    progressDone: 0,
    progressTotal: 0,
    fileError: null,
    hasBlockingIssues: false,
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

function buttonFor(html: string, label: string): string | undefined {
  return html
    .split("<button")
    .slice(1)
    .map((segment) => `<button${segment.split("</button>")[0]}`)
    .find((segment) => segment.includes(label));
}

describe("ImportWizard", () => {
  it("offers a file picker restricted to workbooks on the first step", () => {
    const html = render({ step: "file" });

    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".xlsx"');
    expect(html).toContain("DataTransfer.import.chooseFile");
  });

  it("surfaces a rejected file instead of failing silently", () => {
    expect(render({ step: "file", fileError: "tooLarge" })).toContain("DataTransfer.import.fileRejected");
  });

  it("lists every source column with a target selector on the mapping step", () => {
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

    expect(html.match(/data-select/g)).toHaveLength(2);
    expect(html).toContain("A. First name");
    expect(html).toContain("DataTransfer.import.unnamedColumn");
    expect(html).toContain('data-option="field:firstName"');
  });

  it("blocks the commit while the preview still has problems", () => {
    const html = render({
      step: "preview",
      plan: { create: [{}], update: [], issues: [] },
      issues: [{ sheetRow: 4, columnLetter: "B", columnLabel: "Status", fieldPath: "", message: "bad", code: "x" }],
      hasBlockingIssues: true,
    });

    expect(html).toContain("DataTransfer.import.issueCount");
    expect(buttonFor(html, "DataTransfer.import.commit")).toContain('disabled=""');
  });

  it("allows the commit when the preview is clean", () => {
    const html = render({
      step: "preview",
      plan: { create: [{}], update: [], issues: [] },
      issues: [],
      hasBlockingIssues: false,
    });

    expect(html).toContain("DataTransfer.import.noIssues");
    expect(buttonFor(html, "DataTransfer.import.commit")).not.toContain('disabled=""');
  });

  it("reports where a partial import stopped so the remainder is not silently lost", () => {
    const html = render({
      step: "result",
      summary: { created: 3600, updated: 0, notAttempted: 1400, stoppedAtSheetRow: 3605 },
    });

    expect(html).toContain("DataTransfer.import.resultCounts");
    expect(html).toContain("DataTransfer.import.stopped");
  });

  it("omits the stopped notice when everything landed", () => {
    const html = render({
      step: "result",
      summary: { created: 12, updated: 3, notAttempted: 0, stoppedAtSheetRow: null },
    });

    expect(html).toContain("DataTransfer.import.resultCounts");
    expect(html).not.toContain("DataTransfer.import.stopped");
  });
});
