import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ZOD_MODULE, MOCK_PRISMA_DB_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "test",
  APP_MODE: "cloud" as string,
  BASE_URL: "http://localhost:4000",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "0".repeat(32),
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { renderTokenAgeMs, renderTokenIssuedTo } from "@/core/network/public-submit-guard";

import type { BookingLinkLookup } from "../booking-link.repo";

import { ReadPublicBookingInteractor } from "../read-public-booking.interactor";
import {
  type AccessOptions,
  ANA,
  BO,
  buildAccess,
  calendarId,
  calendarRow,
  candidate,
  LINK_ID,
  lookupLink,
  OWNER,
  TOKEN,
} from "./public-booking-fixtures";

const SECRET = "booking-read-secret";
const NOW = new Date("2026-11-16T10:00:00.000Z");

function build(options: { link?: BookingLinkLookup; calendars?: AccessOptions["calendars"]; badge?: boolean } = {}) {
  const { access, lookup } = buildAccess({
    link: options.link ?? lookupLink({ hostName: "Ben", companyId: mockUser.companyId, userId: mockUser.id }),
    calendars: options.calendars,
    authSecret: SECRET,
    now: NOW,
  });
  const limits = vi.fn().mockResolvedValue({ submissionsPerMonth: null, badge: options.badge ?? false });
  return { interactor: new ReadPublicBookingInteractor(access, { loadModel: vi.fn() }, { limits }), lookup, limits };
}

const TEAM = lookupLink({
  hostName: "Ben",
  assignment: "roundRobin",
  hostCandidates: [candidate(OWNER), candidate(ANA), candidate(BO)],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.APP_MODE = "cloud";
});

describe("ReadPublicBookingInteractor", () => {
  it("returns the page with a render token that proves when the page was rendered", async () => {
    const result = await build().interactor.invoke({ token: TOKEN, visitor: "v" });

    if (result.status !== "available") throw new Error("expected an available page");
    expect(result.page).toMatchObject({ title: "Intro call", hostName: "Test User", team: false, durationMinutes: 30 });
    expect(renderTokenAgeMs(result.page.renderToken, LINK_ID, new Date(NOW.getTime() + 5_000), SECRET)).toBe(5_000);
    expect(renderTokenAgeMs(result.page.renderToken, "other-link", new Date(NOW.getTime() + 5_000), SECRET)).toBeNull();
    expect(renderTokenIssuedTo(result.page.renderToken, "v", SECRET)).toBe(true);
    expect(renderTokenIssuedTo(result.page.renderToken, "w", SECRET)).toBe(false);
  });

  it("carries the workspace's logo and accent colour, and no brand when none is set", async () => {
    const plain = await build().interactor.invoke({ token: TOKEN });
    const branded = await build({
      link: lookupLink({
        companyId: mockUser.companyId,
        userId: mockUser.id,
        brand: { accentColor: "#0f62fe", logoKey: "logo_key_abcdefghijkl" },
      }),
    }).interactor.invoke({ token: TOKEN });

    expect(plain).toMatchObject({ status: "available", page: { brand: null } });
    expect(branded).toMatchObject({
      status: "available",
      page: { brand: { accentColor: "#0f62fe", logoUrl: "/api/brand/logo/logo_key_abcdefghijkl" } },
    });
  });

  it("shows the badge only when the plan of the page's workspace carries it", async () => {
    const free = build({ badge: true });
    const paid = build();

    expect(await free.interactor.invoke({ token: TOKEN })).toMatchObject({
      status: "available",
      page: { badge: true },
    });
    expect(await paid.interactor.invoke({ token: TOKEN })).toMatchObject({
      status: "available",
      page: { badge: false },
    });
    expect(free.limits).toHaveBeenCalledWith(mockUser.companyId);
  });

  it("is unavailable outside the cloud and does not look the link up", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const { interactor, lookup } = build();

    expect(await interactor.invoke({ token: TOKEN })).toEqual({ status: "unavailable" });
    expect(lookup.findByTokenUnscoped).not.toHaveBeenCalled();
  });

  it("shows a round robin page with more than one usable host as a team under the owner's name", async () => {
    const result = await build({ link: TEAM }).interactor.invoke({ token: TOKEN });

    expect(result).toMatchObject({ status: "available", page: { hostName: "Ben", team: true } });
  });

  it("names the one host left when the other hosts cannot take bookings", async () => {
    const result = await build({
      link: TEAM,
      calendars: { [calendarId(OWNER.id)]: null, [calendarId(ANA.id)]: calendarRow(ANA.id), [calendarId(BO.id)]: null },
    }).interactor.invoke({ token: TOKEN });

    expect(result).toMatchObject({ status: "available", page: { hostName: "Ana Host", team: false } });
  });

  it("is unavailable for a malformed token", async () => {
    expect(await build().interactor.invoke({ token: "x" })).toEqual({ status: "unavailable" });
  });
});
