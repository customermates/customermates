import type { RecordDto } from "@/features/records/record-model.schema";

import { runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runXlsxImport } from "@/features/data-transfer/import/xlsx/xlsx-import-plan";
import {
  fields,
  labels,
  model,
  PROJECT,
  PROJECT_COMPANY,
} from "@/features/data-transfer/import/xlsx/__tests__/xlsx-fixture";

const actions = vi.hoisted(() => ({
  getRecordChoicesAction: vi.fn(),
  getUsersAction: vi.fn(),
  importRecordsAction: vi.fn(),
  queryRecordsAction: vi.fn(),
}));

const notice = vi.hoisted(() => ({ changed: false, notify: vi.fn() }));

vi.mock("../../../actions", () => ({
  getRecordChoicesAction: actions.getRecordChoicesAction,
  importRecordsAction: actions.importRecordsAction,
  queryRecordsAction: actions.queryRecordsAction,
}));

vi.mock("@/app/[locale]/(protected)/settings/(workspace)/actions", () => ({
  getUsersAction: actions.getUsersAction,
}));

vi.mock("@/core/errors/workspace-changed-notice", async () => {
  const { isWorkspaceChangedError, isWorkspaceChangedFailure } = await import("@/core/errors/workspace-changed");
  return {
    hasWorkspaceChanged: () => notice.changed,
    notifyIfWorkspaceChanged: (value: unknown) => {
      const changed = isWorkspaceChangedFailure(value) || isWorkspaceChangedError(value);
      if (changed) {
        notice.changed = true;
        notice.notify();
      }
      return changed;
    },
  };
});

import { xlsxImportPorts } from "../xlsx-import-ports";
import { XlsxImportWizardStore } from "../xlsx-import-wizard.store";

const WORKSPACE_CHANGED = {
  ok: false,
  code: "workspaceChanged",
  error: { errors: [], digest: "CUSTOMERMATES_WORKSPACE_CHANGED" },
};

const describeIssue = (issue: { code: string }) => issue.code;

function plannedRows(count: number): Parameters<typeof runXlsxImport>[0]["rows"] {
  return Array.from({ length: count }, (_, index) => ({
    sheetRow: index + 2,
    record: {
      ref: { typeId: PROJECT, recordId: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` },
    } as RecordDto,
    links: [],
    issues: [],
    skipped: null,
  }));
}

function wizard(mapping: string[]) {
  const store = new XlsxImportWizardStore(model, PROJECT, labels, xlsxImportPorts("Import failed"));
  runInAction(() => {
    store.workbook = {
      sheets: [
        {
          name: "Projects",
          headers: mapping.map((key) => key),
          rows: [{ sheetRow: 2, cells: mapping.map(() => "Atlas") }],
        },
      ],
    };
    store.mapping = mapping;
    store.step = "mapping";
  });
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  notice.changed = false;
});

describe("xlsx import after a workspace change", () => {
  it("stops importing at the first workspace-changed batch and opens the reload dialog", async () => {
    actions.importRecordsAction.mockResolvedValue(WORKSPACE_CHANGED);

    const summary = await runXlsxImport({
      rows: plannedRows(250),
      mode: "create",
      typeId: PROJECT,
      schemaRevision: model.revision,
      sessionKey: "session",
      now: "2026-10-17T10:00:00.000Z",
      importRecords: xlsxImportPorts("Import failed").importRecords,
      describeIssue,
    });

    expect(actions.importRecordsAction).toHaveBeenCalledOnce();
    expect(notice.notify).toHaveBeenCalledOnce();
    expect(summary.created).toBe(0);
    expect(summary.failed).toHaveLength(250);
  });

  it("keeps the mapping step without lookup issues when a relationship lookup hits a workspace change", async () => {
    actions.getRecordChoicesAction.mockResolvedValue(WORKSPACE_CHANGED);
    const store = wizard([`field:${fields.name.id}`, `relationship:${PROJECT_COMPANY}`]);

    await store.advance(describeIssue);

    expect(actions.getRecordChoicesAction).toHaveBeenCalledOnce();
    expect(notice.notify).toHaveBeenCalledOnce();
    expect(store.step).toBe("mapping");
    expect(store.lookups).toBeNull();
    expect(store.loading).toBe(false);
  });

  it("does not report a failed record lookup when the update lookup hits a workspace change", async () => {
    actions.queryRecordsAction.mockResolvedValue(WORKSPACE_CHANGED);
    const store = wizard(["recordId", `field:${fields.name.id}`]);
    await store.advance(describeIssue);
    await store.advance(describeIssue);
    store.setMode("update");

    await store.advance(describeIssue);

    expect(actions.queryRecordsAction).toHaveBeenCalledOnce();
    expect(notice.notify).toHaveBeenCalledOnce();
    expect(store.failure).toBeNull();
    expect(store.running).toBe(false);
    expect(actions.importRecordsAction).not.toHaveBeenCalled();
  });

  it("still reports a failed record lookup for other failures", async () => {
    actions.queryRecordsAction.mockResolvedValue({ ok: false, error: { errors: ["Unavailable"] } });
    const store = wizard(["recordId", `field:${fields.name.id}`]);
    await store.advance(describeIssue);
    await store.advance(describeIssue);
    store.setMode("update");

    await store.advance(describeIssue);

    expect(notice.notify).not.toHaveBeenCalled();
    expect(store.failure).toBe("lookup");
  });
});
