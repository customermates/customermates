import { describe, expect, it, vi } from "vitest";
import { Currency } from "@/generated/prisma";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/core/di", () => ({
  getUpdateCompanySettingsInteractor: () => ({ invoke }),
}));

import { updateCompanyAction } from "../actions";

describe("legacy workspace settings cutover", () => {
  it("allows currency updates and rejects old record labels and weighting writes", async () => {
    invoke.mockResolvedValue({ ok: true, data: { currency: Currency.eur } });
    await expect(updateCompanyAction({ currency: Currency.eur })).resolves.toMatchObject({ ok: true });
    expect(invoke).toHaveBeenCalledWith({ currency: Currency.eur });

    invoke.mockClear();
    await expect(
      updateCompanyAction({ terminology: [{ entityType: "deal", presetKey: "project" }] } as never),
    ).rejects.toThrow(/retired/);
    await expect(updateCompanyAction({ dealWeightingColumnId: null } as never)).rejects.toThrow(/retired/);
    await expect(
      updateCompanyAction({ dealStageWeights: [{ optionValue: "open", weight: 50 }] } as never),
    ).rejects.toThrow(/retired/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
