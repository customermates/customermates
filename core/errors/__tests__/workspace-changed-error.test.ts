import { describe, expect, it } from "vitest";

import { ForbiddenError, isExpectedError } from "../app-errors";
import { WORKSPACE_CHANGED_DIGEST, isWorkspaceChangedError, isWorkspaceChangedFailure } from "../workspace-changed";
import { WorkspaceChangedError } from "../workspace-changed-error";

const REDACTED_MESSAGE =
  "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.";

describe("WorkspaceChangedError", () => {
  it("is an expected refusal that carries a stable digest through the framework to the browser", () => {
    const error = new WorkspaceChangedError();

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toContain("not available");
    expect(error.digest).toBe(WORKSPACE_CHANGED_DIGEST);
    expect(isExpectedError(error)).toBe(true);
    expect(isWorkspaceChangedError(error)).toBe(true);
    expect(new ForbiddenError()).not.toBeInstanceOf(WorkspaceChangedError);
  });

  it("is recognised in the browser by the digest of the redacted error alone", () => {
    const redacted = Object.assign(new Error(REDACTED_MESSAGE), { digest: WORKSPACE_CHANGED_DIGEST });

    expect(isWorkspaceChangedError(redacted)).toBe(true);
    expect(isWorkspaceChangedError(Object.assign(new Error(REDACTED_MESSAGE), { digest: "301885173" }))).toBe(false);
    expect(isWorkspaceChangedError(null)).toBe(false);
  });

  it("is recognised in a structured REST failure that a browser fetch received", () => {
    const failure = (customCode: string) => ({
      error: { kind: "conflict", issues: [{ code: "custom", path: [], message: "", customCode }] },
    });

    expect(isWorkspaceChangedFailure(failure("workspaceChanged"))).toBe(true);
    expect(isWorkspaceChangedFailure(failure("userInactive"))).toBe(true);
    expect(isWorkspaceChangedFailure(failure("permissionDenied"))).toBe(false);
    expect(isWorkspaceChangedFailure("limit")).toBe(false);
    expect(isWorkspaceChangedFailure(null)).toBe(false);
  });

  it("is recognised in every failure shape a server action returns", () => {
    const issue = (customCode: string) => ({ code: "custom", path: [], message: "", customCode });

    expect(
      isWorkspaceChangedFailure({
        ok: false,
        code: "workspaceChanged",
        error: { errors: [], digest: WORKSPACE_CHANGED_DIGEST },
      }),
    ).toBe(true);
    expect(isWorkspaceChangedFailure({ ok: false, error: { errors: [], digest: WORKSPACE_CHANGED_DIGEST } })).toBe(
      true,
    );
    expect(
      isWorkspaceChangedFailure({ ok: false, failure: { kind: "conflict", issues: [issue("workspaceChanged")] } }),
    ).toBe(true);
    expect(isWorkspaceChangedFailure({ kind: "conflict", issues: [issue("workspaceChanged")] })).toBe(true);
    expect(isWorkspaceChangedFailure({ ok: false, code: "permissionDenied", error: { errors: ["Forbidden"] } })).toBe(
      false,
    );
    expect(
      isWorkspaceChangedFailure({ ok: false, failure: { kind: "conflict", issues: [issue("recordVersionChanged")] } }),
    ).toBe(false);
    expect(isWorkspaceChangedFailure({ ok: true, data: { code: "workspaceChanged" } })).toBe(false);
  });
});
