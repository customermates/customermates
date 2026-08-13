import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import { AUDIT_EVENT_ENTITY_TYPE, auditEntityTypeFor, auditEventsForEntityTypes } from "../audit-entity-type";
import { AUDIT_LOG_EXCLUDED_EVENTS, DomainEvent } from "../domain-events";

describe("AUDIT_EVENT_ENTITY_TYPE", () => {
  it("classifies every domain event, so adding one without a decision fails to compile", () => {
    const events = Object.values(DomainEvent);

    expect(Object.keys(AUDIT_EVENT_ENTITY_TYPE).sort()).toEqual([...events].sort());
  });

  it("maps each crm event to the entity type it is about", () => {
    expect(auditEntityTypeFor(DomainEvent.CONTACT_UPDATED)).toBe(EntityType.contact);
    expect(auditEntityTypeFor(DomainEvent.ORGANIZATION_DELETED)).toBe(EntityType.organization);
    expect(auditEntityTypeFor(DomainEvent.DEAL_CREATED)).toBe(EntityType.deal);
    expect(auditEntityTypeFor(DomainEvent.SERVICE_UPDATED)).toBe(EntityType.service);
    expect(auditEntityTypeFor(DomainEvent.TASK_DELETED)).toBe(EntityType.task);
  });

  it("refuses to guess a record for events whose subject is not a crm record", () => {
    for (const event of [
      DomainEvent.USER_REGISTERED,
      DomainEvent.USER_UPDATED,
      DomainEvent.COMPANY_UPDATED,
      DomainEvent.ROLE_CREATED,
      DomainEvent.WEBHOOK_UPDATED,
      DomainEvent.CUSTOM_COLUMN_DELETED,
      DomainEvent.CONNECTED_ACCOUNT_CREATED,
    ])
      expect(auditEntityTypeFor(event)).toBeNull();
  });

  it("never claims a crm record for a messaging event, whose entityId is a connected account", () => {
    for (const event of AUDIT_LOG_EXCLUDED_EVENTS) expect(auditEntityTypeFor(event)).toBeNull();
  });

  it("treats an unknown event as unclassified rather than throwing", () => {
    expect(auditEntityTypeFor("something.invented")).toBeNull();
  });
});

describe("auditEventsForEntityTypes", () => {
  it("returns only the events belonging to the requested types", () => {
    expect(auditEventsForEntityTypes([EntityType.deal]).sort()).toEqual(
      [DomainEvent.DEAL_CREATED, DomainEvent.DEAL_UPDATED, DomainEvent.DEAL_DELETED].sort(),
    );
  });

  it("unions across several types", () => {
    const events = auditEventsForEntityTypes([EntityType.contact, EntityType.task]);

    expect(events).toContain(DomainEvent.CONTACT_CREATED);
    expect(events).toContain(DomainEvent.TASK_DELETED);
    expect(events).not.toContain(DomainEvent.DEAL_CREATED);
    expect(events).toHaveLength(6);
  });

  it("returns nothing for no requested types, so the caller does not build an empty IN clause by accident", () => {
    expect(auditEventsForEntityTypes([])).toEqual([]);
  });

  it("covers every crm event exactly once across all five types", () => {
    const all = auditEventsForEntityTypes(Object.values(EntityType));

    expect(all).toHaveLength(15);
    expect(new Set(all).size).toBe(15);
  });
});
