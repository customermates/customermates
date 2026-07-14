import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { UpdateCompanyDetailsInteractor } from "../update-company-details.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const COMPANY_ID = "test-company-id";

describe("UpdateCompanyDetailsInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;

  const companyData = { currency: "usd" as const };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      updateDetails: vi.fn().mockResolvedValue(undefined),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpdateCompanyDetailsInteractor(mockRepo, mockEventService);
  }

  it("publishes COMPANY_UPDATED event", async () => {
    const interactor = createInteractor();
    await interactor.invoke(companyData);

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.COMPANY_UPDATED,
      expect.objectContaining({
        entityId: COMPANY_ID,
        payload: { currency: "usd" },
      }),
    );
  });

  it("calls repo.updateDetails", async () => {
    const interactor = createInteractor();
    await interactor.invoke(companyData);

    expect(mockRepo.updateDetails).toHaveBeenCalledWith({ currency: "usd" });
  });

  it("returns { ok: true, data }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke(companyData);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ currency: "usd" });
  });

  it("rejects an unknown currency", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ currency: "xxx" } as never);

    expect(result.ok).toBe(false);
    expect(mockRepo.updateDetails).not.toHaveBeenCalled();
  });
});
