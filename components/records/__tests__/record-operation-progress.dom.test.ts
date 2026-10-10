import type { Root as ReactRoot } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getRecordOperationAction: vi.fn(),
  cancelRecordOperationAction: vi.fn(),
  resumeRecordOperationAction: vi.fn(),
}));
const announceMovedToTrash = vi.hoisted(() => vi.fn());
const rootStore = vi.hoisted(() => ({ trashStore: { announceMovedToTrash } }));

vi.mock("@/app/[locale]/(protected)/records/actions", () => actions);
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => rootStore,
}));

import { RecordOperationProgress } from "../record-operation-progress";

const OPERATION_ID = "50000000-0000-4000-8000-000000000001";

let root: ReactRoot | undefined;
let container: HTMLDivElement | undefined;

function status(result: unknown) {
  return { ok: true, data: { id: OPERATION_ID, state: "completed", processed: 2, total: 2, errorCode: null, result } };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("RecordOperationProgress", () => {
  it("offers Undo once a background delete has moved its records to Trash", async () => {
    actions.getRecordOperationAction.mockResolvedValue(
      status({ status: "completed", refs: [], schemaRevision: 1, trashBatchId: OPERATION_ID }),
    );
    const onCompleted = vi.fn(() => Promise.resolve());

    act(() =>
      root?.render(
        createElement(RecordOperationProgress, { operationId: OPERATION_ID, onCompleted, onStopped: vi.fn() }),
      ),
    );

    await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(announceMovedToTrash).toHaveBeenCalledExactlyOnceWith({ trashBatchId: OPERATION_ID });
  });

  it("completes other operations without an Undo toast", async () => {
    actions.getRecordOperationAction.mockResolvedValue(status({ status: "completed", refs: [], schemaRevision: 1 }));
    const onCompleted = vi.fn(() => Promise.resolve());

    act(() =>
      root?.render(
        createElement(RecordOperationProgress, { operationId: OPERATION_ID, onCompleted, onStopped: vi.fn() }),
      ),
    );

    await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
    expect(announceMovedToTrash).not.toHaveBeenCalled();
  });
});
