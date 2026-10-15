import { describe, expect, it, vi } from "vitest";

import { MOCK_PRISMA_DB_MODULE } from "@/tests/helpers/interactor-test-setup";

const mode = vi.hoisted(() => ({ app: "demo" as "demo" | "cloud" }));

vi.mock("@/env", () => ({
  env: {
    get APP_MODE() {
      return mode.app;
    },
    BASE_URL: "http://127.0.0.1:4000",
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "address-demo-mode-secret",
    FILE_STORAGE_DRIVER: "database",
    ADDRESS_LOOKUP_URL: "https://photon.example.test",
  },
}));
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

const { getAddressLookupService } = await import("@/core/di");

const CALLER = {
  companyId: "00000000-0000-4000-8000-0000000000c1",
  userId: "00000000-0000-4000-8000-0000000000a1",
  locale: "en",
  country: null,
};

describe("address lookup in demo mode", () => {
  it("stays off for the shared demo account even when a lookup service is configured", async () => {
    mode.app = "demo";
    const demo = getAddressLookupService();
    expect(demo.enabled).toBe(false);
    expect(await demo.lookup(CALLER, { query: "Hauptstraße 5", limit: 5 })).toEqual({ status: "off" });
    expect(await demo.verify(CALLER, { city: "Mannheim" })).toEqual({ status: "off" });

    mode.app = "cloud";
    expect(getAddressLookupService().enabled).toBe(true);
  });
});
