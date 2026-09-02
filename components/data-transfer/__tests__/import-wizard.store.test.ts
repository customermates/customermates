import type { PlanRow } from "@/features/data-transfer/import/import-plan";
import type { RootStore } from "@/core/stores/root.store";

import { runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";

import { IMPORT_CHUNK_SIZE } from "@/features/data-transfer/data-transfer.schema";

const transferActions = vi.hoisted(() => ({
  commitImportChunkAction: vi.fn(),
  dryRunImportChunkAction: vi.fn(),
  getImportRelationIndexAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(protected)/data-transfer/actions", () => transferActions);

vi.mock("@/app/actions", () => ({
  getCustomColumnsByEntityTypeAction: vi.fn(),
}));

import { ImportWizardStore } from "../import-wizard.store";

const rootStore = { registerModalStore: vi.fn() } as unknown as RootStore;

function planRow(sheetRow: number): PlanRow {
  return { sheetRow, sourceIndex: sheetRow - 2, recordId: null, payload: { name: `Row ${sheetRow}` } };
}

function makeStore(createRows: PlanRow[]) {
  const store = new ImportWizardStore(rootStore);

  runInAction(() => {
    store.entityType = EntityType.deal;
    store.plan = { create: createRows, update: [], issues: [] };
  });

  return store;
}

function issue(sheetRow: number, blocking = true) {
  return {
    sheetRow,
    columnLetter: null,
    columnLabel: null,
    fieldPath: "name",
    message: "bad",
    values: null,
    code: "relationNotFound",
    blocking,
  };
}

describe("ImportWizardStore blocked rows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers to skip a row the planner dropped, so one bad relation cannot dead-end the file", () => {
    const store = makeStore([planRow(2), planRow(3)]);

    runInAction(() => {
      store.parsed = { rows: [{}, {}, {}] } as never;
      store.issues = [issue(4)];
    });

    expect(store.skippableCount).toBe(1);
    expect(store.hasBlockingIssues).toBe(true);

    runInAction(() => {
      store.skipInvalid = true;
    });

    expect(store.hasBlockingIssues).toBe(false);
  });

  it("counts a dropped row as skipped, so the summary adds up to the rows in the file", async () => {
    const store = makeStore([planRow(2), planRow(3)]);

    runInAction(() => {
      store.parsed = { rows: [{}, {}, {}] } as never;
      store.issues = [issue(4)];
      store.skipInvalid = true;
    });

    transferActions.commitImportChunkAction.mockResolvedValue({ ok: true, ids: ["a", "b"] });

    await store.commit();

    const summary = store.summary as { created: number; updated: number; skipped: number; notAttempted: number };
    expect(summary).toMatchObject({ created: 2, updated: 0, skipped: 1, notAttempted: 0 });
    expect(summary.created + summary.updated + summary.skipped + summary.notAttempted).toBe(3);
  });

  it("still refuses a blocking problem that belongs to no row", () => {
    const store = makeStore([planRow(2)]);

    runInAction(() => {
      store.parsed = { rows: [{}] } as never;
      store.issues = [{ ...issue(2), sheetRow: null }];
      store.skipInvalid = true;
    });

    expect(store.skippableCount).toBe(0);
    expect(store.hasBlockingIssues).toBe(true);
  });
});

describe("ImportWizardStore commit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stops at the first failing chunk and reports the rest as not attempted", async () => {
    const rows = Array.from({ length: IMPORT_CHUNK_SIZE * 3 }, (_, index) => planRow(index + 2));
    const store = makeStore(rows);

    transferActions.commitImportChunkAction
      .mockResolvedValueOnce({ ok: true, ids: rows.slice(0, IMPORT_CHUNK_SIZE).map((row) => `id-${row.sheetRow}`) })
      .mockResolvedValueOnce({ ok: false, failure: { kind: "invalid", issues: [] } });

    await store.commit();

    expect(transferActions.commitImportChunkAction).toHaveBeenCalledTimes(2);
    expect(store.summary).toMatchObject({
      created: IMPORT_CHUNK_SIZE,
      notAttempted: IMPORT_CHUNK_SIZE * 2,
      stoppedAtSheetRow: IMPORT_CHUNK_SIZE + 2,
    });
  });

  it("drops blocking rows from the payload and counts them as skipped when skipInvalid is set", async () => {
    const store = makeStore([planRow(2), planRow(3), planRow(4)]);

    runInAction(() => {
      store.skipInvalid = true;
      store.issues = [
        {
          sheetRow: 3,
          columnLetter: null,
          columnLabel: null,
          fieldPath: "name",
          message: "bad",
          values: null,
          code: "invalid",
          blocking: true,
        },
      ];
    });

    transferActions.commitImportChunkAction.mockResolvedValue({ ok: true, ids: ["a", "b"] });

    await store.commit();

    const sent = transferActions.commitImportChunkAction.mock.calls[0][0];
    expect(sent.rows).toHaveLength(2);
    expect(store.summary).toMatchObject({ created: 2, skipped: 1, notAttempted: 0 });
  });

  it("refuses to close while a commit is in flight and releases the guard afterwards", async () => {
    const store = makeStore([planRow(2)]);
    let release: (value: unknown) => void = () => {};

    transferActions.commitImportChunkAction.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    store.open();
    expect(store.isOpen).toBe(true);

    const inFlight = store.commit();
    expect(store.isLoading).toBe(true);

    store.close();
    expect(store.isOpen).toBe(true);

    release({ ok: true, ids: ["a"] });
    await inFlight;

    expect(store.isLoading).toBe(false);
    store.close();
    expect(store.isOpen).toBe(false);
  });
});
