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

  it("names the spreadsheet column a problem came from, so the row is actionable", () => {
    const html = render({
      step: "preview",
      plan: { create: [{}], update: [], issues: [] },
      issues: [
        {
          sheetRow: 4,
          columnLetter: "A",
          columnLabel: "Vorname",
          fieldPath: "firstName",
          message: "expected string, received undefined",
          code: "invalid_type",
        },
      ],
      hasBlockingIssues: true,
    });

    expect(html).toContain("A. Vorname");
    expect(html).toContain("expected string, received undefined");
  });

  it("shows the bare message when no single column can be blamed", () => {
    const html = render({
      step: "preview",
      plan: { create: [{}], update: [], issues: [] },
      issues: [
        {
          sheetRow: 4,
          columnLetter: null,
          columnLabel: null,
          fieldPath: "identifiers[0].value",
          message: "too long",
          code: "too_big",
        },
      ],
      hasBlockingIssues: true,
    });

    expect(html).toContain("too long");
    expect(html).not.toContain("identifiers[0]");
  });

  it("shows the failing rows on the result step, not just a count", () => {
    const html = render({
      step: "result",
      summary: { created: 7, updated: 0, skipped: 0, notAttempted: 3, stoppedAtSheetRow: 12 },
      issues: [
        {
          sheetRow: 12,
          columnLetter: "D",
          columnLabel: "Amount",
          fieldPath: "amount",
          message: "",
          values: { value: "n/a" },
          code: "notANumber",
          blocking: true,
        },
      ],
    });

    expect(html).toContain("DataTransfer.import.resultCounts");
    expect(html).toContain("DataTransfer.import.stopped");
    expect(html).toContain("D. Amount");
    expect(html).toContain("DataTransfer.import.issues.notANumber");
  });

  it("still reports a dropped value on the result step even though the row imported", () => {
    const html = render({
      step: "result",
      summary: { created: 4, updated: 0, skipped: 0, notAttempted: 0, stoppedAtSheetRow: null },
      issues: [
        {
          sheetRow: 3,
          columnLetter: "D",
          columnLabel: "Mobil",
          fieldPath: "",
          message: "",
          values: { value: "hello world" },
          code: "notAPhoneNumber",
          blocking: false,
        },
      ],
    });

    expect(html).toContain("D. Mobil");
    expect(html).toContain("DataTransfer.import.issues.notAPhoneNumber");
  });

  it("keeps the result step quiet when nothing went wrong", () => {
    const html = render({
      step: "result",
      summary: { created: 4, updated: 0, skipped: 0, notAttempted: 0, stoppedAtSheetRow: null },
      issues: [],
    });

    expect(html).toContain("DataTransfer.import.resultCounts");
    expect(html).not.toContain("DataTransfer.import.issueCount");
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

describe("ImportWizard mapping aids", () => {
  const parsed = {
    sheetName: "Contacts",
    rows: [{ sourceIndex: 0, sheetRow: 2, cells: [] }],
    schemaRows: [],
    relationSheets: {},
    sources: [{ index: 0, letter: "A", header: "Column 1", samples: ["ada@example.com", "grace@example.com"] }],
  };

  it("shows each sample value as its own chip, so a long value stays readable", () => {
    const html = render({ step: "mapping", parsed, mapping: [{ kind: "ignore" }] });

    expect(html).toContain("ada@example.com");
    expect(html).toContain("grace@example.com");
    expect(html).not.toContain("ada@example.com, grace@example.com");
    expect(html.match(/data-slot="badge"/g)).toHaveLength(2);
  });

  it("groups the target options, so channels do not sit in one flat list with the fields", () => {
    const html = render({
      step: "mapping",
      parsed,
      mapping: [{ kind: "ignore" }],
      customColumns: [{ id: "16000000-0000-4000-8000-000000000001", label: "Phones" }],
    });

    expect(html.match(/data-group-label=""/g)).toHaveLength(3);
    expect(html.match(/data-group-separator=""/g)).toHaveLength(3);
    expect(html.match(/data-group-label=""><svg/g)).toHaveLength(3);
    expect(html).toContain("DataTransfer.import.groupFields");
    expect(html).toContain("DataTransfer.import.groupCustomFields");
    expect(html).toContain("DataTransfer.import.groupChannels");
  });

  it("leaves out a group that has nothing in it", () => {
    const html = render({ step: "mapping", parsed, mapping: [{ kind: "ignore" }] });

    expect(html).not.toContain("DataTransfer.import.groupCustomFields");
    expect(html.match(/data-group-label=""/g)).toHaveLength(2);
    expect(html.match(/data-group-separator=""/g)).toHaveLength(2);
  });

  it("offers channel targets for contacts, so a foreign email column can become one", () => {
    const html = render({ step: "mapping", parsed, mapping: [{ kind: "ignore" }] });

    expect(html).toContain('data-option="identifier:mail"');
    expect(html).toContain('data-option="identifier:whatsapp"');
  });

  it("blocks the dry run while two columns feed one field, which would silently drop one", () => {
    const html = render({ step: "mapping", parsed, mapping: [{ kind: "ignore" }], duplicateTargetCount: 1 });

    expect(html).toContain("DataTransfer.import.duplicateTargets");
    expect(buttonFor(html, "DataTransfer.import.validate")).toContain('disabled=""');
  });
});

describe("ImportWizard partial import", () => {
  const withIssues = (count: number, overrides: Record<string, unknown> = {}) => ({
    step: "preview",
    plan: { create: [{}], update: [], issues: [] },
    issues: Array.from({ length: count }, (_, index) => ({
      sheetRow: index + 2,
      columnLetter: null,
      columnLabel: null,
      fieldPath: "",
      message: `problem ${index}`,
      code: "x",
    })),
    hasBlockingIssues: true,
    skippableCount: count,
    ...overrides,
  });

  it("offers to skip the invalid rows rather than forcing the whole file to be fixed", () => {
    expect(render(withIssues(3))).toContain("DataTransfer.import.skipInvalid");
  });

  it("enables the commit once skipping is accepted", () => {
    const html = render(withIssues(3, { skipInvalid: true, hasBlockingIssues: false }));

    expect(buttonFor(html, "DataTransfer.import.commit")).not.toContain('disabled=""');
  });

  it("says how many problems it did not list instead of truncating silently", () => {
    const html = render(withIssues(250));

    expect(html).toContain("DataTransfer.import.moreIssues");
  });

  it("does not offer skipping when nothing can be skipped", () => {
    expect(render(withIssues(0, { skippableCount: 0, issues: [] }))).not.toContain("DataTransfer.import.skipInvalid");
  });

  it("reports skipped rows on the result step", () => {
    const html = render({
      step: "result",
      summary: { created: 8, updated: 0, skipped: 2, notAttempted: 0, stoppedAtSheetRow: null },
    });

    expect(html).toContain("DataTransfer.import.resultSkipped");
  });
});
