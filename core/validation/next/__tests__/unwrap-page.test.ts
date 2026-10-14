import { describe, expect, it, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({ notFound }));

const { unwrapPage } = await import("../unwrap-page");

describe("unwrapPage", () => {
  it("returns the data of a successful page read", async () => {
    await expect(unwrapPage(Promise.resolve({ ok: true as const, data: 3 }))).resolves.toBe(3);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("renders the not-found page for a not_found failure", async () => {
    const error = createZodError("List not found", [], {
      error: CustomErrorCode.recordTypeNotFound,
      kind: "not_found",
    });
    await expect(unwrapPage(Promise.resolve({ ok: false as const, error }))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("rethrows every other failure", async () => {
    notFound.mockClear();
    const error = createZodError("Invalid", [], { error: CustomErrorCode.recordValueInvalid });
    await expect(unwrapPage(Promise.resolve({ ok: false as const, error }))).rejects.toBe(error);
    expect(notFound).not.toHaveBeenCalled();
  });
});
