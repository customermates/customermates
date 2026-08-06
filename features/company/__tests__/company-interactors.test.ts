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

import { UpdateCompanySettingsInteractor } from "../update-company-settings.interactor";
import { DomainEvent } from "@/features/event/domain-events";
import { Currency } from "@/generated/prisma";

const COMPANY_ID = "test-company-id";

describe("UpdateCompanySettingsInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;

  const companyData = { currency: Currency.idr };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      updateDetails: vi.fn().mockResolvedValue(undefined),
      upsertTerminology: vi.fn().mockResolvedValue(undefined),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpdateCompanySettingsInteractor(mockRepo, mockEventService);
  }

  it("publishes COMPANY_UPDATED event", async () => {
    const interactor = createInteractor();
    await interactor.invoke(companyData);

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.COMPANY_UPDATED,
      expect.objectContaining({
        entityId: COMPANY_ID,
        payload: { currency: Currency.idr },
      }),
    );
  });

  it("audits a terminology-only change, so renaming records is not silent", async () => {
    const terminology = [{ entityType: "task" as const, presetKey: "followUp" }];
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ terminology });

    expect(result.ok).toBe(true);
    expect(mockRepo.upsertTerminology).toHaveBeenCalledWith(terminology);
    expect(mockRepo.updateDetails).not.toHaveBeenCalled();
    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.COMPANY_UPDATED,
      expect.objectContaining({
        entityId: COMPANY_ID,
        payload: { terminology },
      }),
    );
  });

  it("calls repo.updateDetails", async () => {
    const interactor = createInteractor();
    await interactor.invoke(companyData);

    expect(mockRepo.updateDetails).toHaveBeenCalledWith({
      currency: Currency.idr,
    });
  });

  it("returns { ok: true, data }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke(companyData);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ currency: Currency.idr });
  });

  it.each(["xau", "xxx", "zzz"])("rejects unsupported currency code %s", async (currency) => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ currency } as never);

    expect(result.ok).toBe(false);
    expect(mockRepo.updateDetails).not.toHaveBeenCalled();
  });
});
