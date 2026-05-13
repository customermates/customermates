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
vi.mock("@/core/app-di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { RegisterUserInteractor } from "../register/register-user.interactor";
import { UpdateUserDetailsInteractor } from "../upsert/update-user-details.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const USER_ID = "test-user-id";

const mockExtendedUser = {
  id: USER_ID,
  email: "jane@example.com",
  firstName: "Jane",
  lastName: "Doe",
  country: "DE",
  status: "active",
  avatarUrl: null,
  roleId: "test-role-id",
  companyId: "test-company-id",
  role: {
    id: "test-role-id",
    name: "Admin",
    isSystemRole: true,
    companyId: "test-company-id",
    permissions: [],
  },
};

describe("RegisterUserInteractor", () => {
  let mockAuthService: any;
  let mockRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthService = {
      getSessionOrRedirect: vi.fn().mockResolvedValue({ user: { id: USER_ID } }),
      sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    mockRepo = {
      findCompanyId: vi.fn().mockResolvedValue(null),
      createCompanyAndUser: vi.fn().mockResolvedValue(mockExtendedUser),
      registerExistingCompany: vi.fn().mockResolvedValue(mockExtendedUser),
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

  it("publishes USER_REGISTERED with isNewCompany false for existing company", async () => {
    mockRepo.findCompanyId.mockResolvedValue("existing-company-id");

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

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      updateDetails: vi.fn().mockResolvedValue(detailsData),
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

  it("returns { ok: true, data: details }", async () => {
    const interactor = createInteractor();
    const result: any = await interactor.invoke(detailsData);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({ firstName: "Janet" }));
  });
});
