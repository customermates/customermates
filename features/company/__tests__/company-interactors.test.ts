import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/constants/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { UpdateCompanyDetailsInteractor } from "../update-company-details.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const COMPANY_ID = "test-company-id";

describe("UpdateCompanyDetailsInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;

  const companyData = {
    name: "Acme Corp",
    street: "Main St 1",
    city: "Berlin",
    postalCode: "10115",
    country: "de" as const,
    currency: "eur" as const,
  };

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
        payload: expect.objectContaining({
          name: "Acme Corp",
          city: "Berlin",
          country: "de",
          currency: "eur",
        }),
      }),
    );
  });

  it("calls repo.updateDetails", async () => {
    const interactor = createInteractor();
    await interactor.invoke(companyData);

    expect(mockRepo.updateDetails).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true, data }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke(companyData);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ name: "Acme Corp" }));
  });
});
