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

import { renderTokenAgeMs } from "@/core/network/public-submit-guard";
import { PublicTenant } from "@/core/network/public-tenant";
import { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";

import type { BookingLinkLookup } from "../booking-link.repo";

import { PublicBookingAccess } from "../public-booking-access";
import { ReadPublicBookingInteractor } from "../read-public-booking.interactor";
import { DEFAULT_WORKING_HOURS } from "../working-hours";

const SECRET = "booking-read-secret";
const NOW = new Date("2026-11-16T10:00:00.000Z");
const TOKEN = "tok_abcdefghijklmnop";
const LINK_ID = "50000000-0000-4000-8000-000000000001";

const link = {
  id: LINK_ID,
  companyId: mockUser.companyId,
  userId: mockUser.id,
  calendarId: "60000000-0000-4000-8000-000000000001",
  calendarName: "Work",
  token: TOKEN,
  title: "Intro call",
  description: null,
  durationMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 240,
  horizonDays: 30,
  timeZone: "Europe/Berlin",
  workingHours: DEFAULT_WORKING_HOURS,
  withVideo: false,
  personTypeId: null,
  personRelationshipId: null,
  recordTypeId: null,
  startFieldId: null,
  questions: [],
  successMessage: null,
  enabled: true,
  createdAt: new Date(0),
  upcomingBookings: 0,
  hostName: "Ben",
  workspaceName: "Acme",
  companyDeleting: false,
  unipileAccountId: "acc_1",
  unipileCalendarId: "cal_1",
  connectedAccountId: "70000000-0000-4000-8000-000000000001",
  provider: "google",
  accountUsable: true,
} as BookingLinkLookup;

function build() {
  const lookup = { findByTokenUnscoped: vi.fn().mockResolvedValue(link) };
  const access = new PublicBookingAccess(
    lookup,
    new PublicTenant({ getActiveUserByIdOrThrow: vi.fn().mockResolvedValue(mockUser) }),
    { perLink: new TokenBucketRateLimiter(100, 60_000), perVisitor: new TokenBucketRateLimiter(100, 60_000) },
    () => ({ require: vi.fn().mockResolvedValue(null) }),
    () => ({ companyId: mockUser.companyId, has: vi.fn().mockReturnValue(true) }),
    { authSecret: SECRET, now: () => NOW },
  );
  return { interactor: new ReadPublicBookingInteractor(access, { loadModel: vi.fn() }), lookup };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.APP_MODE = "cloud";
});

describe("ReadPublicBookingInteractor", () => {
  it("returns the page with a render token that proves when the page was rendered", async () => {
    const result = await build().interactor.invoke({ token: TOKEN, visitor: "v" });

    if (result.status !== "available") throw new Error("expected an available page");
    expect(result.page).toMatchObject({ title: "Intro call", hostName: "Ben", durationMinutes: 30 });
    expect(renderTokenAgeMs(result.page.renderToken, LINK_ID, new Date(NOW.getTime() + 5_000), SECRET)).toBe(5_000);
    expect(renderTokenAgeMs(result.page.renderToken, "other-link", new Date(NOW.getTime() + 5_000), SECRET)).toBeNull();
  });

  it("is unavailable outside the cloud and does not look the link up", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const { interactor, lookup } = build();

    expect(await interactor.invoke({ token: TOKEN })).toEqual({ status: "unavailable" });
    expect(lookup.findByTokenUnscoped).not.toHaveBeenCalled();
  });

  it("is unavailable for a malformed token", async () => {
    expect(await build().interactor.invoke({ token: "x" })).toEqual({ status: "unavailable" });
  });
});
