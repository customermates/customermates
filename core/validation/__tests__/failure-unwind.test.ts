import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));

const { failureUnwindCause, unwindFailure } = await import("../failure-unwind");
const { unwoundFailure } = await import("../interactor-failure-server");
const { CustomErrorCode } = await import("../validation.types");
const { interactorFailureStatus, serializeInteractorFailure } = await import("../validation.utils");

describe("failure unwind", () => {
  it("unwinds a standard Error whose typed cause names the failure", () => {
    const error = unwindFailure(CustomErrorCode.recordNotFound, "not_found", ["placement"]);
    expect(error.constructor).toBe(Error);
    expect(failureUnwindCause(error)).toEqual({
      kind: "interactorFailure",
      code: CustomErrorCode.recordNotFound,
      failureKind: "not_found",
      path: ["placement"],
    });
    expect(failureUnwindCause(new Error("plain"))).toBeNull();
    expect(failureUnwindCause(new Error("other", { cause: { kind: "websiteFetch" } }))).toBeNull();
  });

  it.each([
    ["authorization", CustomErrorCode.permissionDenied, 403],
    ["conflict", CustomErrorCode.recordSchemaChanged, 409],
    ["not_found", CustomErrorCode.roleNotFound, 404],
    ["validation", CustomErrorCode.recordValueInvalid, 400],
  ] as const)("converts a %s unwind into the same failure the helpers return", async (kind, code, status) => {
    const failure = await unwoundFailure(unwindFailure(code, kind, ["fields", 0]));
    expect(interactorFailureStatus(failure.error)).toBe(status);
    expect(serializeInteractorFailure(failure.error)).toEqual({
      kind,
      issues: [{ code: "custom", path: ["fields", 0], message: messages.Common.errors[code], customCode: code }],
    });
  });

  it("rethrows anything that is not an unwound failure", async () => {
    const unexpected = new Error("Unexpected database failure");
    await expect(Promise.resolve().then(() => unwoundFailure(unexpected))).rejects.toBe(unexpected);
  });
});
