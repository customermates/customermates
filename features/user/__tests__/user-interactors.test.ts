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
const mockLocale = vi.hoisted(() => ({ value: "de" }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve(mockLocale.value) }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { RegisterUserInteractor } from "../register/register-user.interactor";
import { UpdateUserDetailsInteractor } from "../upsert/update-user-details.interactor";
import { LEGAL_CONTRACT_KEY, LEGAL_INFORMATION_KEY, LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import { DemoModeError } from "@/core/errors/app-errors";

const USER_ID = "test-user-id";
const mutableEnv = MOCK_ENV_MODULE.env as unknown as {
  APP_MODE: "cloud" | "demo" | "self-hosted";
  NODE_ENV: "test" | "production";
  VERCEL_GIT_COMMIT_SHA?: string;
};

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
    mutableEnv.APP_MODE = "self-hosted";
    mutableEnv.NODE_ENV = "test";
    mutableEnv.VERCEL_GIT_COMMIT_SHA = "a".repeat(40);

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

  it("records current company-wide legal acceptance for a new cloud company", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    const interactor = createInteractor();
    await interactor.invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
    });

    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(expect.objectContaining({ agreeToTerms: true }));
    expect(mockEventService.publish).toHaveBeenNthCalledWith(
      1,
      DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
      expect.objectContaining({
        entityId: LEGAL_CONTRACT_KEY,
        payload: expect.objectContaining({
          acceptanceType: "initial-onboarding",
          contractKey: LEGAL_CONTRACT_KEY,
          deployedGitCommit: "a".repeat(40),
          informationKey: LEGAL_INFORMATION_KEY,
          locale: "de",
          versions: LEGAL_DOCUMENT_VERSIONS,
          acceptingUser: { id: USER_ID, email: "jane@example.com" },
        }),
      }),
    );
  });

  it("fails closed when production registration cannot record an immutable deployment commit", async () => {
    mutableEnv.APP_MODE = "cloud";
    mutableEnv.NODE_ENV = "production";
    mutableEnv.VERCEL_GIT_COMMIT_SHA = undefined;

    await expect(
      createInteractor().invoke({
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      }),
    ).rejects.toThrow("immutable legal-version evidence");
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("rejects an unchecked new cloud company before creating records", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";

    const result = await createInteractor().invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: false,
    });

    expect("ok" in result && result.ok).toBe(false);
    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
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
      agreeToTerms: false,
    });

    expect(mockEventService.publish).toHaveBeenCalledWith(
      DomainEvent.USER_REGISTERED,
      expect.objectContaining({
        payload: expect.objectContaining({ isNewCompany: false }),
      }),
    );
    expect(mockRepo.registerExistingCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "existing-company-id",
        agreeToTerms: false,
      }),
    );
    expect(mockEventService.publish).not.toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, expect.anything());
  });

  it("does not record managed-service acceptance for an invited cloud user", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    mockRepo.findCompanyIdUnscoped.mockResolvedValue("existing-company-id");

    const interactor = createInteractor();
    await interactor.invoke({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de",
      avatarUrl: null,
      agreeToTerms: false,
    });

    expect(mockRepo.registerExistingCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "existing-company-id",
        agreeToTerms: false,
      }),
    );
    expect(mockEventService.publish).not.toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, expect.anything());
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

    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(expect.objectContaining({ agreeToTerms: false }));
    expect(mockEventService.publish).not.toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, expect.anything());
  });

  it("blocks demo-mode registration before recording managed-service acceptance", () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "demo";

    expect(() =>
      createInteractor().invoke({
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      }),
    ).toThrow(DemoModeError);

    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, expect.anything());
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
      expect.objectContaining({
        payload: expect.objectContaining({ firstName: "Janet" }),
      }),
    );
  });

  it("returns { ok: true, data: details }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke(detailsData);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ firstName: "Janet", theme: "system" }));
  });
});
