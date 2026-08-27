import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  reportApplicationError: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetP13nInteractor: () => ({ invoke: state.invoke }),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: state.reportApplicationError,
}));

import { getOptionalP13n } from "../get-optional-p13n";

describe("getOptionalP13n", () => {
  beforeEach(() => {
    state.invoke.mockReset();
    state.reportApplicationError.mockReset();
  });

  it("returns the stored personalization entry", async () => {
    const entry = { id: "p13n-1", p13nId: "contact-detail" };
    state.invoke.mockResolvedValue({ ok: true, data: entry });

    await expect(getOptionalP13n("contact-detail")).resolves.toBe(entry);
    expect(state.reportApplicationError).not.toHaveBeenCalled();
  });

  it("returns null when no personalization entry exists", async () => {
    state.invoke.mockResolvedValue({ ok: true, data: undefined });

    await expect(getOptionalP13n("contact-detail")).resolves.toBeNull();
    expect(state.reportApplicationError).not.toHaveBeenCalled();
  });

  it("reports a failed optional read and lets the page use defaults", async () => {
    const error = new Error("personalization unavailable");
    state.invoke.mockRejectedValue(error);

    await expect(getOptionalP13n("contact-detail")).resolves.toBeNull();
    expect(state.reportApplicationError).toHaveBeenCalledWith(error);
  });
});
