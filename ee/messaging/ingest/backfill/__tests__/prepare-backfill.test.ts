import { describe, it, expect, vi } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({ ...createMockDiModule(() => mockUser) }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { classifyAccountReadiness } from "../prepare-backfill.interactor";

const whatsapp = { status: "running" as const, provider: "whatsapp" };
const email = { status: "running" as const, provider: "mail" };

describe("classifyAccountReadiness", () => {
  it("treats a pending initial_sync as ready for WhatsApp (data is served while pending) but waits for others", () => {
    expect(classifyAccountReadiness({ ...whatsapp, initial_sync: { status: "pending" } } as any)).toBe("ready");
    expect(classifyAccountReadiness({ ...email, initial_sync: { status: "pending" } } as any)).toBe("waiting");
  });

  it("still waits on an actively running initial_sync for every provider except WhatsApp", () => {
    expect(classifyAccountReadiness({ ...email, initial_sync: { status: "running" } } as any)).toBe("waiting");
    expect(classifyAccountReadiness({ ...whatsapp, initial_sync: { status: "running" } } as any)).toBe("ready");
  });

  it("is ready once a gated initial_sync completes or fails", () => {
    expect(classifyAccountReadiness({ ...email, initial_sync: { status: "completed" } } as any)).toBe("ready");
    expect(classifyAccountReadiness({ ...email, initial_sync: { status: "failed" } } as any)).toBe("ready");
  });

  it("stalls on a disconnected or paused account regardless of provider", () => {
    expect(classifyAccountReadiness({ provider: "whatsapp", status: "disconnected" } as any)).toBe("stalled");
    expect(classifyAccountReadiness({ provider: "mail", status: "paused" } as any)).toBe("stalled");
  });
});
