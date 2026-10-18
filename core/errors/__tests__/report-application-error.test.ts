import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ captureError: vi.fn() }));

vi.mock("../sentry-client", () => ({ captureError: harness.captureError }));

const DIGEST = "CUSTOMERMATES_WORKSPACE_CHANGED";
const ISSUE = { code: "custom", path: [], message: "", customCode: "workspaceChanged" };

async function freshModule() {
  vi.resetModules();
  const errors = { ...(await import("../report-application-error")), ...(await import("../workspace-changed-notice")) };
  const showDialog = vi.fn();
  const toast = vi.fn();
  errors.registerWorkspaceChangedHandler(showDialog);
  errors.registerApplicationErrorHandler(toast);
  return { errors, showDialog, toast };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifyIfWorkspaceChanged", () => {
  it.each([
    ["a serialized action result", { ok: false, code: "workspaceChanged", error: { errors: [], digest: DIGEST } }],
    ["a typed action result", { ok: false, failure: { kind: "conflict", issues: [ISSUE] } }],
    ["a typed failure", { kind: "conflict", issues: [ISSUE] }],
    ["a REST failure body", { error: { kind: "conflict", issues: [ISSUE] } }],
    ["a redacted server action error", Object.assign(new Error("redacted"), { digest: DIGEST })],
  ])("opens the reload dialog for %s", async (_shape, failure) => {
    const { errors, showDialog } = await freshModule();

    expect(errors.notifyIfWorkspaceChanged(failure)).toBe(true);
    expect(showDialog).toHaveBeenCalledOnce();
    expect(errors.hasWorkspaceChanged()).toBe(true);
  });

  it.each([
    ["a successful result", { ok: true, data: 3 }],
    ["another refusal", { ok: false, code: "permissionDenied", error: { errors: ["Forbidden"] } }],
    ["another typed refusal", { ok: false, failure: { kind: "authorization", issues: [] } }],
    ["a plain error", new Error("offline")],
    ["nothing", null],
  ])("leaves %s to its caller", async (_shape, value) => {
    const { errors, showDialog } = await freshModule();

    expect(errors.notifyIfWorkspaceChanged(value)).toBe(false);
    expect(showDialog).not.toHaveBeenCalled();
    expect(errors.hasWorkspaceChanged()).toBe(false);
  });
});

describe("reportApplicationError", () => {
  it("reports an unexpected error while the tab is current", async () => {
    const { errors, toast } = await freshModule();
    const error = new Error("boom");

    errors.reportApplicationError(error);

    expect(harness.captureError).toHaveBeenCalledExactlyOnceWith(error);
    expect(toast).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("reports nothing and shows no toast once the tab's workspace changed", async () => {
    const { errors, showDialog, toast } = await freshModule();

    errors.reportApplicationError(Object.assign(new Error("redacted"), { digest: DIGEST }));
    errors.reportApplicationError(new Error("Inbox unread count could not be loaded"));

    expect(showDialog).toHaveBeenCalledOnce();
    expect(harness.captureError).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
