import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  getRecordOperationAction: vi.fn(),
  cancelRecordOperationAction: vi.fn(),
  resumeRecordOperationAction: vi.fn(),
  reportApplicationError: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  getRecordOperationAction: harness.getRecordOperationAction,
  cancelRecordOperationAction: harness.cancelRecordOperationAction,
  resumeRecordOperationAction: harness.resumeRecordOperationAction,
}));

vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: harness.reportApplicationError,
  runUserAction: (action: () => unknown) => void Promise.resolve(action()).catch(harness.reportApplicationError),
}));

vi.mock("@/core/errors/workspace-changed-notice", async () => {
  const { isWorkspaceChangedError, isWorkspaceChangedFailure } = await import("@/core/errors/workspace-changed");
  return {
    notifyIfWorkspaceChanged: (value: unknown) => {
      const changed = isWorkspaceChangedFailure(value) || isWorkspaceChangedError(value);
      if (changed) harness.notify();
      return changed;
    },
  };
});

import { RecordOperationProgress } from "../record-operation-progress";

const WORKSPACE_CHANGED = {
  ok: false,
  code: "workspaceChanged",
  error: { errors: [], digest: "CUSTOMERMATES_WORKSPACE_CHANGED" },
};
const PENDING = { ok: true, data: { id: "operation", state: "pending", processed: 1, total: 4 } };

let root: Root;
let container: HTMLDivElement;

function render() {
  act(() =>
    root.render(
      createElement(RecordOperationProgress, {
        operationId: "operation",
        onCompleted: () => Promise.resolve(),
        onStopped: vi.fn(),
      }),
    ),
  );
}

async function settle(ms = 0) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

function button(label: string) {
  const element = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  if (!element) throw new Error(`Button ${label} did not render.`);
  return element;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("RecordOperationProgress after a workspace change", () => {
  it("opens the reload dialog and stops polling instead of showing the unavailable state", async () => {
    harness.getRecordOperationAction.mockResolvedValue(WORKSPACE_CHANGED);

    render();
    await settle(10_000);

    expect(harness.notify).toHaveBeenCalledOnce();
    expect(harness.getRecordOperationAction).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("RecordModel.operationPending");
    expect(container.textContent).not.toContain("RecordModel.progressUnavailable");
    expect(container.textContent).not.toContain("RecordModel.retry");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("does not show or report a thrown workspace-changed poll error", async () => {
    harness.getRecordOperationAction.mockRejectedValue(
      Object.assign(new Error("x"), { digest: "CUSTOMERMATES_WORKSPACE_CHANGED" }),
    );

    render();
    await settle(10_000);

    expect(harness.notify).toHaveBeenCalledOnce();
    expect(harness.getRecordOperationAction).toHaveBeenCalledOnce();
    expect(harness.reportApplicationError).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("RecordModel.progressUnavailable");
  });

  it("keeps the progress when cancelling hits a workspace change", async () => {
    harness.getRecordOperationAction.mockResolvedValue(PENDING);
    harness.cancelRecordOperationAction.mockResolvedValue(WORKSPACE_CHANGED);

    render();
    await settle();
    await act(async () => {
      button("RecordModel.cancelOperation").click();
      await Promise.resolve();
    });
    await settle();

    expect(harness.cancelRecordOperationAction).toHaveBeenCalledExactlyOnceWith("operation");
    expect(harness.notify).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("RecordModel.operationProgress");
    expect(container.textContent).not.toContain("RecordModel.progressUnavailable");
    expect(button("RecordModel.cancelOperation").disabled).toBe(false);
  });

  it("still shows the unavailable state for other failures", async () => {
    harness.getRecordOperationAction.mockResolvedValue({ ok: false, error: { errors: ["Unavailable"] } });

    render();
    await settle();

    expect(harness.notify).not.toHaveBeenCalled();
    expect(container.textContent).toContain("RecordModel.progressUnavailable");
    expect(container.textContent).toContain("RecordModel.retry");
  });
});
