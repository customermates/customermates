import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AddressCheckResult } from "@/features/addresses/address-check.schema";

const actions = vi.hoisted(() => ({
  checkAddressAction: vi.fn(),
  lookupAddressAction: vi.fn(),
  verifyAddressAction: vi.fn(),
}));
vi.mock("@/app/[locale]/(protected)/w/[workspace]/records/actions", () => actions);

import { registerWorkspaceChangedHandler } from "@/core/errors/workspace-changed-notice";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordAddressCheckStore } from "../record-address-check.store";

const PARTS = { street: null, line2: null, postalCode: "68259", city: null, region: null, countryCode: "de" };

function result(status: AddressCheckResult["postalCode"]["status"], city: string | null = null): AddressCheckResult {
  return {
    address: {
      ...PARTS,
      city,
      formatted: "68259",
      location: null,
      verification: { status: "unverified", provider: null, checkedAt: null },
    },
    issues: [],
    postalCode: {
      status,
      match: status === "ready" ? "exact" : null,
      places:
        status === "ready"
          ? [{ city: "Mannheim", region: null, location: { lat: 49.49, lon: 8.53, precision: "postcode" } }]
          : [],
    },
    attribution: status === "ready" ? "Postal codes: GeoNames (geonames.org), CC BY 4.0" : null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("address check store", () => {
  it("checks the parts 400 ms after the last change and only shows the result for the same parts", async () => {
    const check = actions.checkAddressAction.mockReset().mockResolvedValue({ ok: true, data: result("ready") });
    const store = new RecordAddressCheckStore();
    store.schedule({ ...PARTS, postalCode: "6825" });
    await vi.advanceTimersByTimeAsync(200);
    store.schedule(PARTS);
    store.schedule(PARTS);
    await vi.advanceTimersByTimeAsync(399);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(PARTS);
    expect(store.resultFor(PARTS)?.postalCode.status).toBe("ready");
    expect(store.resultFor({ ...PARTS, city: "Mannheim" })).toBeNull();
  });

  it("does not ask the server about a street or city alone", async () => {
    const check = actions.checkAddressAction.mockReset();
    const store = new RecordAddressCheckStore();
    store.schedule({ ...PARTS, postalCode: null, countryCode: null, street: "Hauptstraße 5", city: "Mannheim" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(check).not.toHaveBeenCalled();
    expect(store.current).toBeNull();
  });

  it("asks again while the country's postal codes are still loading", async () => {
    const check = actions.checkAddressAction
      .mockReset()
      .mockResolvedValueOnce({ ok: true, data: result("loading") })
      .mockResolvedValueOnce({ ok: true, data: result("ready") });
    const store = new RecordAddressCheckStore();
    store.schedule(PARTS);
    await vi.advanceTimersByTimeAsync(400);
    expect(store.resultFor(PARTS)?.postalCode.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(4000);
    expect(check).toHaveBeenCalledTimes(2);
    expect(store.resultFor(PARTS)?.postalCode.status).toBe("ready");
  });

  it("reports a switched workspace instead of showing a check", async () => {
    const changed = vi.fn();
    const unregister = registerWorkspaceChangedHandler(changed);
    const check = actions.checkAddressAction
      .mockReset()
      .mockResolvedValue({ ok: false, code: CustomErrorCode.workspaceChanged });
    const store = new RecordAddressCheckStore();
    store.schedule(PARTS);
    await vi.advanceTimersByTimeAsync(400);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(store.current).toBeNull();
    await vi.advanceTimersByTimeAsync(4000);
    expect(check).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("drops an answer that arrives after the parts changed or the store was reset", async () => {
    let answer: (value: unknown) => void = () => undefined;
    actions.checkAddressAction.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const store = new RecordAddressCheckStore();
    store.schedule(PARTS);
    await vi.advanceTimersByTimeAsync(400);
    store.reset();
    answer({ ok: true, data: result("ready") });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.current).toBeNull();
  });
});
