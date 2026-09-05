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
import { UpdateUserDetailsInteractor, UpdateUserDetailsSchema } from "../upsert/update-user-details.interactor";
import { AdminUpdateUserDetailsSchema } from "../upsert/admin-update-user-details.interactor";
import { LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import { DemoModeError } from "@/core/errors/app-errors";
import { ACCOUNT_STATES, accountStateRedirect } from "@/features/auth/account-state";

const USER_ID = "test-user-id";
const mutableEnv = MOCK_ENV_MODULE.env as unknown as {
  APP_MODE: "cloud" | "demo" | "self-hosted";
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
  let mockRouteGuardService: any;
  let mockCompanyRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mutableEnv.APP_MODE = "self-hosted";

    mockAuthService = {
      sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    mockRepo = {
      bindAuthUserToCompanyOrThrowUnscoped: vi.fn().mockResolvedValue(undefined),
      findCurrentUserUnscoped: vi.fn().mockResolvedValue(null),
      findAuthUserCompanyIdForUpdateUnscoped: vi.fn().mockResolvedValue(null),
      findAuthUserCompanyIdUnscoped: vi.fn().mockResolvedValue(null),
      createCompanyAndUser: vi.fn().mockResolvedValue(mockTenantUser),
      registerExistingCompany: vi.fn().mockResolvedValue(mockTenantUser),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockRouteGuardService = {
      resolveAccountState: vi.fn().mockResolvedValue({
        state: "unregistered",
        sessionUser: {
          createdAt: new Date(0),
          email: "jane@example.com",
          emailVerified: true,
          id: USER_ID,
        },
        user: null,
        emailVerified: true,
        legalStatus: null,
        subscription: null,
      }),
    };
    mockCompanyRepo = { existsUnscoped: vi.fn().mockResolvedValue(true) };
  });

  function createInteractor() {
    return new RegisterUserInteractor(
      mockAuthService,
      mockRepo,
      mockEventService,
      mockRouteGuardService,
      mockCompanyRepo,
    );
  }

  it("publishes USER_REGISTERED event for new company", async () => {
    const interactor = createInteractor();
    await interactor.invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      { target: { type: "createCompany" } },
    );

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
    expect(mockRepo.bindAuthUserToCompanyOrThrowUnscoped).toHaveBeenCalledWith({
      authUserId: USER_ID,
      companyId: mockTenantUser.companyId,
    });
  });

  it("records current company-wide legal acceptance for a new cloud company", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    const interactor = createInteractor();
    await interactor.invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      { target: { type: "createCompany" } },
    );

    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(expect.objectContaining({ agreeToTerms: true }));
    expect(mockEventService.publish).toHaveBeenNthCalledWith(
      1,
      DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
      expect.objectContaining({
        entityId: mockTenantUser.companyId,
        payload: {
          acceptanceType: "initial-onboarding",
          acceptingEmail: "jane@example.com",
          versions: LEGAL_DOCUMENT_VERSIONS,
        },
      }),
    );
  });

  it("passes unexpired consented ad clicks only to a new cloud owner", async () => {
    mutableEnv.APP_MODE = "cloud";
    const adAttribution = [
      {
        provider: "google_ads" as const,
        identifierKind: "gclid" as const,
        identifierValue: "Case-Sensitive_GCLID",
        clickedAt: new Date(Date.now() - 2_000),
        capturedAt: new Date(Date.now() - 1_000),
        consentedAt: new Date(Date.now() - 1_000),
        consentNoticeVersion: "2026-09-02",
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        provider: "openai_ads" as const,
        identifierKind: "oppref" as const,
        identifierValue: "Opaque-OPPREF",
        clickedAt: new Date(Date.now() - 2_000),
        capturedAt: new Date(Date.now() - 1_000),
        consentedAt: new Date(Date.now() - 1_000),
        consentNoticeVersion: "2026-09-02",
        expiresAt: new Date(Date.now() + 60_000),
      },
    ];
    const data = {
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      country: "de" as const,
      avatarUrl: null,
      agreeToTerms: true,
    };

    await createInteractor().invoke(data, { adAttribution, target: { type: "createCompany" } });
    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(expect.objectContaining({ adAttribution }));

    vi.clearAllMocks();
    mockRepo.findAuthUserCompanyIdForUpdateUnscoped.mockResolvedValue("existing-company-id");
    mockRepo.findAuthUserCompanyIdUnscoped.mockResolvedValue("existing-company-id");
    mockRepo.registerExistingCompany.mockResolvedValue(mockTenantUser);
    mockEventService.publish.mockResolvedValue(undefined);
    mockAuthService.sendNewUserNotificationEmail.mockResolvedValue(undefined);
    await createInteractor().invoke(data, { adAttribution, target: { type: "existingAuthUserCompanyBinding" } });

    const existingCompanyArgs = mockRepo.registerExistingCompany.mock.calls[0]?.[0];
    expect(existingCompanyArgs).toEqual({ ...data, companyId: "existing-company-id" });
    expect(Object.hasOwn(existingCompanyArgs, "adAttribution")).toBe(false);
  });

  it("drops an expired ad click before owner creation", async () => {
    mutableEnv.APP_MODE = "cloud";
    await createInteractor().invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      {
        adAttribution: [
          {
            provider: "google_ads",
            identifierKind: "gclid",
            identifierValue: "expired-click",
            clickedAt: new Date("2026-01-01T00:00:00.000Z"),
            capturedAt: new Date("2026-01-01T00:00:00.000Z"),
            consentedAt: new Date("2026-01-01T00:00:00.000Z"),
            consentNoticeVersion: "2026-09-02",
            expiresAt: new Date("2026-01-02T00:00:00.000Z"),
          },
        ],
        target: { type: "createCompany" },
      },
    );

    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(expect.objectContaining({ adAttribution: [] }));
  });

  it("rejects an unchecked new cloud company before creating records", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";

    const result = await createInteractor().invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: false,
      },
      { target: { type: "createCompany" } },
    );

    expect("ok" in result && result.ok).toBe(false);
    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("publishes USER_REGISTERED with isNewCompany false for existing company", async () => {
    mockRepo.findAuthUserCompanyIdForUpdateUnscoped.mockResolvedValue("existing-company-id");
    mockRepo.findAuthUserCompanyIdUnscoped.mockResolvedValue("existing-company-id");

    const interactor = createInteractor();
    await interactor.invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: false,
      },
      { target: { type: "existingAuthUserCompanyBinding" } },
    );

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

  it("rejects an unchecked invited cloud user before updating records", async () => {
    mutableEnv.APP_MODE = "cloud";
    mockRepo.findAuthUserCompanyIdForUpdateUnscoped.mockResolvedValue("existing-company-id");
    mockRepo.findAuthUserCompanyIdUnscoped.mockResolvedValue("existing-company-id");

    const result = await createInteractor().invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: false,
      },
      { target: { type: "existingAuthUserCompanyBinding" } },
    );

    expect("ok" in result && result.ok).toBe(false);
    expect(mockRepo.registerExistingCompany).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("does not record managed-service acceptance for an invited cloud user", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    mockRepo.findAuthUserCompanyIdForUpdateUnscoped.mockResolvedValue("existing-company-id");
    mockRepo.findAuthUserCompanyIdUnscoped.mockResolvedValue("existing-company-id");

    const interactor = createInteractor();
    await interactor.invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      { target: { type: "existingAuthUserCompanyBinding" } },
    );

    expect(mockRepo.registerExistingCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "existing-company-id",
        agreeToTerms: true,
      }),
    );
    expect(mockEventService.publish).not.toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, expect.anything());
  });

  it("does not represent self-hosted onboarding as acceptance of the managed-service documents", async () => {
    const interactor = createInteractor();
    await interactor.invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: false,
      },
      { target: { type: "createCompany" } },
    );

    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(expect.objectContaining({ agreeToTerms: false }));
    expect(mockEventService.publish).not.toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, expect.anything());
  });

  it("preserves a submitted self-hosted acknowledgement without creating managed-service acceptance", async () => {
    await createInteractor().invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      { target: { type: "createCompany" } },
    );

    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(expect.objectContaining({ agreeToTerms: true }));
    expect(mockEventService.publish).not.toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, expect.anything());
  });

  it("blocks demo-mode registration before recording managed-service acceptance", () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "demo";

    expect(() =>
      createInteractor().invoke(
        {
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          country: "de",
          avatarUrl: null,
          agreeToTerms: true,
        },
        { target: { type: "createCompany" } },
      ),
    ).toThrow(DemoModeError);

    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, expect.anything());
  });

  it("calls authService.sendNewUserNotificationEmail", async () => {
    const interactor = createInteractor();
    await interactor.invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      { target: { type: "createCompany" } },
    );

    expect(mockAuthService.sendNewUserNotificationEmail).toHaveBeenCalledWith({
      email: "jane@example.com",
      name: "Jane Doe",
    });
  });

  it("returns the onboarding destination for a new active administrator", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      { target: { type: "createCompany" } },
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ redirectTo: "/onboarding/wizard" });
  });

  it("uses the authenticated email instead of a forged submitted email", async () => {
    const result: any = await createInteractor().invoke(
      {
        email: "not-an-email",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      { target: { type: "createCompany" } },
    );

    expect(result).toMatchObject({ ok: true });
    expect(mockRepo.createCompanyAndUser).toHaveBeenCalledWith(expect.objectContaining({ email: "jane@example.com" }));
    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalledWith(expect.objectContaining({ email: "not-an-email" }));
  });

  it("returns the pending destination for an invited user", async () => {
    mockRepo.findAuthUserCompanyIdForUpdateUnscoped.mockResolvedValue("existing-company-id");
    mockRepo.findAuthUserCompanyIdUnscoped.mockResolvedValue("existing-company-id");
    mockRepo.registerExistingCompany.mockResolvedValue({
      ...mockTenantUser,
      status: "pendingAuthorization",
    });

    const result: any = await createInteractor().invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      { target: { type: "existingAuthUserCompanyBinding" } },
    );

    expect(result).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });
  });

  it("requires an explicit create decision when no workspace invitation exists", async () => {
    await expect(
      createInteractor().invoke(
        {
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          country: "de",
          avatarUrl: null,
          agreeToTerms: true,
        },
        { target: { type: "existingAuthUserCompanyBinding" } },
      ),
    ).resolves.toEqual({ redirect: "/onboarding" });
    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
    expect(mockRepo.registerExistingCompany).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
    expect(mockAuthService.sendNewUserNotificationEmail).not.toHaveBeenCalled();
  });

  it("fails closed when the cached session identity no longer exists", async () => {
    mockRepo.findAuthUserCompanyIdForUpdateUnscoped.mockResolvedValue(undefined);

    await expect(
      createInteractor().invoke(
        {
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          country: "de",
          avatarUrl: null,
          agreeToTerms: true,
        },
        { target: { type: "invitation", companyId: "invited-company-id" } },
      ),
    ).resolves.toEqual({ redirect: "/auth/signup" });
    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
    expect(mockRepo.registerExistingCompany).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
    expect(mockAuthService.sendNewUserNotificationEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["pendingAuthorization", "/auth/pending"],
    ["active", "/onboarding/wizard"],
    ["inactive", "/auth/error?type=inactiveUser"],
  ] as const)("makes a repeated registration for an existing %s user idempotent", async (status, redirect) => {
    mockRepo.findCurrentUserUnscoped.mockResolvedValue({ ...mockTenantUser, status });

    await expect(
      createInteractor().invoke(
        {
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          country: "de",
          avatarUrl: null,
          agreeToTerms: true,
        },
        { target: { type: "invitation", companyId: "invited-company-id" } },
      ),
    ).resolves.toEqual({ redirect });
    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
    expect(mockRepo.registerExistingCompany).not.toHaveBeenCalled();
    expect(mockRepo.bindAuthUserToCompanyOrThrowUnscoped).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("gives the current invitation precedence over an older live identity binding", async () => {
    mockRepo.findAuthUserCompanyIdForUpdateUnscoped.mockResolvedValue("older-company-id");
    mockRepo.registerExistingCompany.mockResolvedValue({
      ...mockTenantUser,
      status: "pendingAuthorization",
    });

    await createInteractor().invoke(
      {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        country: "de",
        avatarUrl: null,
        agreeToTerms: true,
      },
      { target: { type: "invitation", companyId: "current-invited-company-id" } },
    );

    expect(mockRepo.registerExistingCompany).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "current-invited-company-id" }),
    );
    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
    expect(mockRepo.bindAuthUserToCompanyOrThrowUnscoped).toHaveBeenCalledWith({
      authUserId: USER_ID,
      companyId: mockTenantUser.companyId,
    });
  });

  it("fails cleanly when the invited workspace disappears before registration", async () => {
    mockCompanyRepo.existsUnscoped.mockResolvedValue(false);

    await expect(
      createInteractor().invoke(
        {
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          country: "de",
          avatarUrl: null,
          agreeToTerms: true,
        },
        { target: { type: "invitation", companyId: "deleted-company-id" } },
      ),
    ).resolves.toEqual({ redirect: "/auth/error?type=invalidInviteLink" });
    expect(mockRepo.findAuthUserCompanyIdForUpdateUnscoped).not.toHaveBeenCalled();
    expect(mockRepo.registerExistingCompany).not.toHaveBeenCalled();
    expect(mockRepo.bindAuthUserToCompanyOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("rejects a missing authenticated session before any write", async () => {
    mockRouteGuardService.resolveAccountState.mockResolvedValue({
      state: "unauthenticated",
      sessionUser: null,
      user: null,
      emailVerified: null,
      legalStatus: null,
      subscription: null,
    });

    await expect(
      createInteractor().invoke(
        {
          email: "jane@example.com",
          firstName: "Jane",
          lastName: "Doe",
          country: "de",
          avatarUrl: null,
          agreeToTerms: true,
        },
        { target: { type: "existingAuthUserCompanyBinding" } },
      ),
    ).resolves.toEqual({ redirect: "/auth/signin" });
    expect(mockRepo.findAuthUserCompanyIdForUpdateUnscoped).not.toHaveBeenCalled();
    expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
    expect(mockRepo.registerExistingCompany).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
    expect(mockAuthService.sendNewUserNotificationEmail).not.toHaveBeenCalled();
  });

  it.each(ACCOUNT_STATES.filter((state) => state !== "unauthenticated" && state !== "unregistered"))(
    "redirects the %s account state without any write",
    async (state) => {
      mockRouteGuardService.resolveAccountState.mockResolvedValue({
        state,
        sessionUser: {
          createdAt: new Date(0),
          email: "jane@example.com",
          emailVerified: true,
          id: USER_ID,
        },
        user: state === "overdueVerification" ? null : mockTenantUser,
        emailVerified: true,
        legalStatus: null,
        subscription: null,
      });

      await expect(
        createInteractor().invoke(
          {
            email: "jane@example.com",
            firstName: "Jane",
            lastName: "Doe",
            country: "de",
            avatarUrl: null,
            agreeToTerms: true,
          },
          { target: { type: "existingAuthUserCompanyBinding" } },
        ),
      ).resolves.toEqual({ redirect: accountStateRedirect(state) ?? "/" });
      expect(mockRepo.findAuthUserCompanyIdForUpdateUnscoped).not.toHaveBeenCalled();
      expect(mockRepo.createCompanyAndUser).not.toHaveBeenCalled();
      expect(mockRepo.registerExistingCompany).not.toHaveBeenCalled();
      expect(mockEventService.publish).not.toHaveBeenCalled();
      expect(mockAuthService.sendNewUserNotificationEmail).not.toHaveBeenCalled();
    },
  );
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

  it("normalizes retired stored locale values while saving unrelated profile fields", async () => {
    mockRepo.updateDetails.mockResolvedValue({
      ...profileResult,
      displayLanguage: "retired",
      formattingLocale: "retired",
    });

    const result: any = await createInteractor().invoke({
      theme: "dark",
    } as never);

    expect(result.ok).toBe(true);
    expect(result.data.displayLanguage).toBe("system");
    expect(result.data.formattingLocale).toBe("system");
  });
});

describe("avatar schemas require an absolute URL", () => {
  const SEEDED_AVATAR = "https://customermates.com/demo/avatars/photos/max-bergmann.png";

  it("keeps the seeded absolute avatar verbatim on the self-update schema", () => {
    expect(UpdateUserDetailsSchema.safeParse({ avatarUrl: SEEDED_AVATAR })).toMatchObject({
      success: true,
      data: { avatarUrl: SEEDED_AVATAR },
    });
  });

  it("keeps it verbatim on the admin schema, which re-parses a stored avatar on every role change", () => {
    const result = AdminUpdateUserDetailsSchema.safeParse({
      email: "max.bergmann@customermates.com",
      firstName: "Max",
      lastName: "Bergmann",
      country: CountryCode.de,
      status: "active",
      avatarUrl: SEEDED_AVATAR,
      roleId: "00000000-0000-4000-8000-000000000001",
    });

    expect(result).toMatchObject({ success: true, data: { avatarUrl: SEEDED_AVATAR } });
  });

  it.each([["/demo/avatars/photos/max-bergmann.png"], ["//cdn.example.com/a.png"]])(
    "rejects the relative avatar %j rather than resolving it to another host",
    (avatarUrl) => {
      expect(UpdateUserDetailsSchema.safeParse({ avatarUrl }).success).toBe(false);
    },
  );

  it("still normalises a bare host to https", () => {
    expect(UpdateUserDetailsSchema.safeParse({ avatarUrl: "cdn.example.com/a.png" })).toMatchObject({
      success: true,
      data: { avatarUrl: "https://cdn.example.com/a.png" },
    });
  });

  it("still accepts an empty string to clear the avatar", () => {
    expect(UpdateUserDetailsSchema.safeParse({ avatarUrl: "" })).toMatchObject({
      success: true,
      data: { avatarUrl: "" },
    });
  });
});
