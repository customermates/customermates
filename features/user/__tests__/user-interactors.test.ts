import { describe, it, expect, vi, beforeEach } from "vitest";
import { CountryCode } from "@/generated/prisma";
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

import { RegisterUserInteractor } from "../register/register-user.interactor";
import { UpdateUserDetailsInteractor } from "../upsert/update-user-details.interactor";
import { LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";

const USER_ID = "test-user-id";

const mockTenantUser = createMockUser({
  email: "jane@example.com",
  firstName: "Jane",
  lastName: "Doe",
  country: CountryCode.de,
});

describe("RegisterUserInteractor", () => {
  let mockAuthService: any;
  let mockRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "self-hosted" }).APP_MODE = "self-hosted";

    mockAuthService = {
      resolveSession: vi.fn().mockResolvedValue({ session: { user: { id: USER_ID } } }),
      sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    mockRepo = {
      findCompanyIdUnscoped: vi.fn().mockResolvedValue(null),
      createCompanyAndUser: vi.fn().mockResolvedValue(mockTenantUser),
      registerExistingCompany: vi.fn().mockResolvedValue(mockTenantUser),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new RegisterUserInteractor(mockAuthService, mockRepo, mockEventService);
  }

  it("publishes USER_REGISTERED event for new company", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.USER_REGISTERED,
      expect.objectContaining({
        entityId: USER_ID,
        payload: expect.objectContaining({
          email: "jane@example.com",
          firstName: "Jane",
          isNewCompany: true,
        }),
      }),
    );
  });

  it("passes the current legal document versions to a new company registration", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "self-hosted" }).APP_MODE = "cloud";
    const interactor = createInteractor();
    await interactor.invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
    });

    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(
      expect.objectContaining({
        legalAcceptedAt: expect.any(Date),
        legalDpaVersion: LEGAL_DOCUMENT_VERSIONS.dpa,
        legalPrivacyVersion: LEGAL_DOCUMENT_VERSIONS.privacy,
        legalTermsVersion: LEGAL_DOCUMENT_VERSIONS.terms,
      }),
    );
  });

  it("publishes USER_REGISTERED with isNewCompany false for existing company", async () => {
    mockRepo.findCompanyIdUnscoped.mockResolvedValue("existing-company-id");

    const interactor = createInteractor();
    await interactor.invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.USER_REGISTERED,
      expect.objectContaining({
        payload: expect.objectContaining({ isNewCompany: false }),
      }),
    );
  });

  it("passes the current legal document versions to an existing company registration", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "self-hosted" }).APP_MODE = "cloud";
    mockRepo.findCompanyIdUnscoped.mockResolvedValue("existing-company-id");

    const interactor = createInteractor();
    await interactor.invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
    });

    expect(mockRepo.registerExistingCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "existing-company-id",
        legalAcceptedAt: expect.any(Date),
        legalDpaVersion: LEGAL_DOCUMENT_VERSIONS.dpa,
        legalPrivacyVersion: LEGAL_DOCUMENT_VERSIONS.privacy,
        legalTermsVersion: LEGAL_DOCUMENT_VERSIONS.terms,
      }),
    );
  });

  it("does not represent self-hosted onboarding as acceptance of the managed-service documents", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
    });

    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(
      expect.objectContaining({
        legalAcceptedAt: null,
        legalDpaVersion: null,
        legalPrivacyVersion: null,
        legalTermsVersion: null,
      }),
    );
  });

  it("calls authService.sendNewUserNotificationEmail", async () => {
    const interactor = createInteractor();
    await interactor.invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
    });

    expect(mockAuthService.sendNewUserNotificationEmail).toHaveBeenCalledWith({
      email: "jane@example.com",
      name: "Jane Doe",
    });
  });

  it("returns { ok: true, data }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ email: "jane@example.com", firstName: "Jane" }));
  });
});

describe("UpdateUserDetailsInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;

  const detailsData = {
    firstName: "Janet",
    lastName: "Doe",
    country: "de" as const,
    avatarUrl: null,
  };

  const profileResult = {
    ...detailsData,
    theme: "system" as const,
    displayLanguage: "en" as const,
    formattingLocale: "en" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      updateDetails: vi.fn().mockResolvedValue(profileResult),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new UpdateUserDetailsInteractor(mockRepo, mockEventService);
  }

  it("publishes USER_UPDATED event", async () => {
    const interactor = createInteractor();
    await interactor.invoke(detailsData);

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.USER_UPDATED,
      expect.objectContaining({
        entityId: USER_ID,
        payload: expect.objectContaining({
          firstName: "Janet",
          lastName: "Doe",
          country: "de",
        }),
      }),
    );
  });

  it("calls repo.updateDetails", async () => {
    const interactor = createInteractor();
    await interactor.invoke(detailsData);

    expect(mockRepo.updateDetails).toHaveBeenCalledTimes(1);
  });

  it("accepts a partial update and publishes the resulting profile", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke({ theme: "dark" } as never);

    expect(result.ok).toBe(true);
    expect(mockRepo.updateDetails).toHaveBeenCalledWith({ theme: "dark" });
    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.USER_UPDATED,
      expect.objectContaining({ payload: expect.objectContaining({ firstName: "Janet" }) }),
    );
  });

  it("returns { ok: true, data: details }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke(detailsData);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ firstName: "Janet", theme: "system" }));
  });
});
