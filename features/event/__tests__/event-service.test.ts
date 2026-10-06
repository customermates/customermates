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

import { EventService } from "../event.service";
import { DomainEvent } from "../domain-events";
import { runWithTenant } from "@/core/decorators/tenant-context";

const ENTITY_ID = "00000000-0000-4000-8000-000000000001";
const SYSTEM_COMPANY_ID = "00000000-0000-4000-8000-000000000002";
const MESSAGE = {
  connectedAccountId: ENTITY_ID,
  provider: "whatsapp",
  providerMessageId: "provider-message",
  threadId: ENTITY_ID,
} as const;

describe("EventService", () => {
  let eventLog: { appendUnscoped: ReturnType<typeof vi.fn>; hasSubscribersUnscoped: ReturnType<typeof vi.fn> };
  let service: EventService;

  beforeEach(() => {
    vi.clearAllMocks();
    eventLog = {
      appendUnscoped: vi.fn().mockResolvedValue(undefined),
      hasSubscribersUnscoped: vi.fn().mockResolvedValue(false),
    };
    service = new EventService([], eventLog as never);
  });

  it("writes an administrative event as delivered history with the tenant user as actor", async () => {
    await runWithTenant(mockUser, () =>
      service.publish(DomainEvent.ROLE_DELETED, { entityId: ENTITY_ID, payload: { id: ENTITY_ID } as never }),
    );

    expect(eventLog.hasSubscribersUnscoped).not.toHaveBeenCalled();
    expect(eventLog.appendUnscoped).toHaveBeenCalledExactlyOnceWith(mockUser.companyId, {
      kind: DomainEvent.ROLE_DELETED,
      subjectId: ENTITY_ID,
      actorId: mockUser.id,
      payload: { id: ENTITY_ID },
      delivered: true,
    });
  });

  it("skips an update whose changes are empty", async () => {
    await runWithTenant(mockUser, () =>
      service.publish(DomainEvent.ROLE_UPDATED, {
        entityId: ENTITY_ID,
        payload: { role: {} as never, changes: {} },
      }),
    );

    expect(eventLog.appendUnscoped).not.toHaveBeenCalled();
  });

  it("writes a messaging event only while a webhook or routine subscribes to it", async () => {
    await service.publish(
      DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      { entityId: ENTITY_ID, payload: MESSAGE },
      { systemCompanyId: SYSTEM_COMPANY_ID },
    );
    expect(eventLog.hasSubscribersUnscoped).toHaveBeenCalledWith(
      SYSTEM_COMPANY_ID,
      DomainEvent.MESSAGING_MESSAGE_RECEIVED,
    );
    expect(eventLog.appendUnscoped).not.toHaveBeenCalled();

    eventLog.hasSubscribersUnscoped.mockResolvedValue(true);
    await service.publish(
      DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      { entityId: ENTITY_ID, payload: MESSAGE },
      { systemCompanyId: SYSTEM_COMPANY_ID },
    );
    expect(eventLog.appendUnscoped).toHaveBeenCalledExactlyOnceWith(SYSTEM_COMPANY_ID, {
      kind: DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      subjectId: ENTITY_ID,
      actorId: null,
      payload: MESSAGE,
      delivered: false,
    });
  });

  it("keeps the system actor of a system event", async () => {
    await service.publish(
      DomainEvent.CONNECTED_ACCOUNT_DELETED,
      { entityId: ENTITY_ID, payload: { provider: "whatsapp", displayName: null, emailAddress: null } },
      { systemCompanyId: SYSTEM_COMPANY_ID, systemUserId: mockUser.id },
    );

    expect(eventLog.appendUnscoped).toHaveBeenCalledWith(
      SYSTEM_COMPANY_ID,
      expect.objectContaining({ actorId: mockUser.id, delivered: true }),
    );
  });

  it("runs matching in-process listeners for tenant events but not for system events", async () => {
    const listener = { handles: vi.fn().mockReturnValue(true), handle: vi.fn().mockResolvedValue(undefined) };
    service = new EventService([listener as never], eventLog as never);

    await runWithTenant(mockUser, () =>
      service.publish(DomainEvent.ROLE_DELETED, { entityId: ENTITY_ID, payload: { id: ENTITY_ID } as never }),
    );
    await service.publish(
      DomainEvent.CONNECTED_ACCOUNT_DELETED,
      { entityId: ENTITY_ID, payload: { provider: "whatsapp", displayName: null, emailAddress: null } },
      { systemCompanyId: SYSTEM_COMPANY_ID },
    );

    expect(listener.handle).toHaveBeenCalledExactlyOnceWith(
      DomainEvent.ROLE_DELETED,
      expect.objectContaining({ userId: mockUser.id, companyId: mockUser.companyId, entityId: ENTITY_ID }),
    );
  });
});
