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

import { classifyAccountReadiness, PrepareBackfillInteractor } from "../prepare-backfill.interactor";

const whatsapp = { status: "running" as const, provider: "whatsapp" };
const email = { status: "running" as const, provider: "imap" };

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
    expect(classifyAccountReadiness({ provider: "imap", status: "paused" } as any)).toBe("stalled");
  });

  it("does not wait on unavailable Gmail's initial sync before reading an operational calendar", async () => {
    const snapshot = {
      id: "acc_calendar",
      provider: "google",
      status: "partial" as const,
      metadata: { products_connection_status: { gmail: "disconnected", calendar: "running" } },
      initial_sync: { status: "pending" as const },
    };
    expect(classifyAccountReadiness(snapshot)).toBe("ready");
    const repo = {
      findAccountByIdUnscoped: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        unipileAccountId: snapshot.id,
        status: "credentials",
        backfillClaimToken: "test-token",
        hasMessaging: true,
        hasCalendar: true,
      }),
      updateAccountUnscoped: vi.fn().mockResolvedValue(null),
    };
    const service = { getAccount: vi.fn().mockResolvedValue(snapshot), listFolders: vi.fn() };
    const result = await new PrepareBackfillInteractor(repo as never, service as never).invoke({
      connectedAccountId: "00000000-0000-4000-8000-000000000001",
      token: "test-token",
    });
    expect(result).toEqual({ status: "ready", kind: "none", sources: [], hasCalendar: true });
    expect(service.listFolders).not.toHaveBeenCalled();
    expect(repo.updateAccountUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ok",
        hasMessaging: false,
        hasCalendar: true,
      }),
    );
  });
});
