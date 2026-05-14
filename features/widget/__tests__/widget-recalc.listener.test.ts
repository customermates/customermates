import { describe, it, expect, vi, beforeEach } from "vitest";

import { WidgetRecalcEventListener } from "../widget-recalc.listener";
import { DomainEvent } from "@/features/event/domain-events";

const MUTATION_EVENTS = [
  DomainEvent.CONTACT_CREATED,
  DomainEvent.CONTACT_UPDATED,
  DomainEvent.CONTACT_DELETED,
  DomainEvent.ORGANIZATION_CREATED,
  DomainEvent.ORGANIZATION_UPDATED,
  DomainEvent.ORGANIZATION_DELETED,
  DomainEvent.DEAL_CREATED,
  DomainEvent.DEAL_UPDATED,
  DomainEvent.DEAL_DELETED,
  DomainEvent.SERVICE_CREATED,
  DomainEvent.SERVICE_UPDATED,
  DomainEvent.SERVICE_DELETED,
  DomainEvent.TASK_CREATED,
  DomainEvent.TASK_UPDATED,
  DomainEvent.TASK_DELETED,
  DomainEvent.ROLE_CREATED,
  DomainEvent.ROLE_UPDATED,
  DomainEvent.ROLE_DELETED,
  DomainEvent.CUSTOM_COLUMN_CREATED,
  DomainEvent.CUSTOM_COLUMN_UPDATED,
  DomainEvent.CUSTOM_COLUMN_DELETED,
];

const NON_MUTATION_EVENTS = [
  DomainEvent.USER_REGISTERED,
  DomainEvent.USER_UPDATED,
  DomainEvent.COMPANY_UPDATED,
  DomainEvent.WEBHOOK_CREATED,
];

describe("WidgetRecalcEventListener", () => {
  let mockBackgroundTaskService: { dispatch: ReturnType<typeof vi.fn> };
  let listener: WidgetRecalcEventListener;

  beforeEach(() => {
    mockBackgroundTaskService = { dispatch: vi.fn().mockResolvedValue(undefined) };
    listener = new WidgetRecalcEventListener(mockBackgroundTaskService as never);
  });

  it.each(MUTATION_EVENTS)("dispatches recalculate-company-widgets on %s", async (event) => {
    expect(listener.handles(event)).toBe(true);

    await listener.handle(event, { companyId: "test-company-id" } as never);

    expect(mockBackgroundTaskService.dispatch).toHaveBeenCalledTimes(1);
    expect(mockBackgroundTaskService.dispatch).toHaveBeenCalledWith(
      "recalculate-company-widgets",
      { companyId: "test-company-id" },
      { idempotencyKey: "recalculate-company-widgets:test-company-id", idempotencyKeyTTL: "30s" },
    );
  });

  it.each(NON_MUTATION_EVENTS)("does NOT dispatch on %s", async (event) => {
    expect(listener.handles(event)).toBe(false);

    await listener.handle(event, { companyId: "test-company-id" } as never);

    expect(mockBackgroundTaskService.dispatch).not.toHaveBeenCalled();
  });
});
