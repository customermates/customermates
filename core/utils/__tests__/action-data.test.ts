import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { WorkspaceChangedError } from "@/core/errors/workspace-changed-error";
import { registerWorkspaceChangedHandler } from "@/core/errors/workspace-changed-notice";

import { actionData, actionDataOrNull } from "../action-data";

function failure(customCode?: CustomErrorCode) {
  return {
    ok: false as const,
    failure: {
      kind: "conflict" as const,
      issues: [{ code: "custom", path: [], message: "Refused", ...(customCode ? { customCode } : {}) }],
    },
  };
}

const unregister: Array<() => void> = [];

afterEach(() => {
  for (const release of unregister.splice(0)) release();
});

function watchNotice() {
  const shown = vi.fn();
  unregister.push(registerWorkspaceChangedHandler(shown));
  return shown;
}

describe("actionData", () => {
  it("returns the data of a successful result", async () => {
    await expect(actionData(Promise.resolve({ ok: true as const, data: { items: [] } }))).resolves.toEqual({
      items: [],
    });
  });

  it.each([CustomErrorCode.workspaceChanged, CustomErrorCode.userInactive])(
    "throws a workspace change for %s and leaves the single reload notice to whoever handles it",
    async (code) => {
      const shown = watchNotice();

      await expect(actionData(Promise.resolve(failure(code)))).rejects.toBeInstanceOf(WorkspaceChangedError);
      expect(shown).not.toHaveBeenCalled();
    },
  );

  it("throws any other failure with its details and shows no notice", async () => {
    const shown = watchNotice();
    const result = failure(CustomErrorCode.permissionDenied);

    await expect(actionData(Promise.resolve(result))).rejects.toMatchObject({
      message: "Refused",
      failure: result.failure,
    });
    expect(shown).not.toHaveBeenCalled();
  });
});

describe("actionDataOrNull", () => {
  it("returns the data, or null for a failure", async () => {
    const shown = watchNotice();

    await expect(actionDataOrNull(Promise.resolve({ ok: true as const, data: 1 }))).resolves.toBe(1);
    await expect(actionDataOrNull(Promise.resolve(failure()))).resolves.toBeNull();
    expect(shown).not.toHaveBeenCalled();
  });

  it("shows the reload notice for a changed workspace and returns null", async () => {
    const shown = watchNotice();

    await expect(actionDataOrNull(Promise.resolve(failure(CustomErrorCode.workspaceChanged)))).resolves.toBeNull();
    expect(shown).toHaveBeenCalledOnce();
  });
});
