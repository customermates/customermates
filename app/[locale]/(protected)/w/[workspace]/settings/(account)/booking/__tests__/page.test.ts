import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers({ "x-cm-workspace": "acme" })) }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn().mockResolvedValue("de") }));

import BookingLinksRedirectPage from "../page";

describe("the retired booking settings route", () => {
  it("sends the old link to the booking panel of the calendar in the visitor's workspace and language", async () => {
    await expect(BookingLinksRedirectPage()).rejects.toThrow("REDIRECT:/de/w/acme/calendar?panel=booking");
  });
});
