import type { PrismaClient } from "@/generated/prisma";
import type { ZodType } from "zod";

import { SYNTHETIC_COMPANY_USERS, SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { DomainEvent } from "@/features/event/domain-events";
import { WebhookContactCreatedSchema } from "@/features/contacts/upsert/contact-created.openapi";
import { WebhookContactUpdatedSchema } from "@/features/contacts/upsert/contact-updated.openapi";
import { WebhookDealCreatedSchema } from "@/features/deals/upsert/deal-created.openapi";
import { WebhookDealUpdatedSchema } from "@/features/deals/upsert/deal-updated.openapi";
import { WebhookOrganizationCreatedSchema } from "@/features/organizations/upsert/organization-created.openapi";
import { WebhookOrganizationUpdatedSchema } from "@/features/organizations/upsert/organization-updated.openapi";
import { describe, expect, it, vi } from "vitest";

import type { SeedContext } from "../seeds/context";

import { SYNTHETIC_CONTACT_NAMES } from "../seeds/contacts";
import { SEED_IDS } from "../seeds/context";
import { SYNTHETIC_DEAL_NAMES } from "../seeds/deals";
import { fixtureId } from "../seeds/helpers";
import { SYNTHETIC_ORGANIZATION_NAMES } from "../seeds/organizations";
import { SYNTHETIC_SEED_TIMELINE } from "../seeds/timeline";
import { seedWebhooks, SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS, SYNTHETIC_WEBHOOK_URL } from "../seeds/webhooks";

const DELIVERY_SCHEMAS = {
  [DomainEvent.CONTACT_CREATED]: WebhookContactCreatedSchema,
  [DomainEvent.CONTACT_UPDATED]: WebhookContactUpdatedSchema,
  [DomainEvent.DEAL_CREATED]: WebhookDealCreatedSchema,
  [DomainEvent.DEAL_UPDATED]: WebhookDealUpdatedSchema,
  [DomainEvent.ORGANIZATION_CREATED]: WebhookOrganizationCreatedSchema,
  [DomainEvent.ORGANIZATION_UPDATED]: WebhookOrganizationUpdatedSchema,
} satisfies Record<(typeof SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS)[number]["event"], ZodType>;

const USER_REFERENCE = {
  id: SEED_IDS.user,
  firstName: SYNTHETIC_COMPANY_USERS.maxBergmann.firstName,
  lastName: SYNTHETIC_COMPANY_USERS.maxBergmann.lastName,
  avatarUrl: "https://customermates.com/demo/avatars/photos/max-bergmann.png",
  email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
};

function selectedEntityIndexes(entityType: "contact" | "deal" | "organization"): number[] {
  return [
    ...new Set(
      SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.filter((definition) => definition.entityType === entityType).map(
        ({ entityIndex }) => entityIndex,
      ),
    ),
  ];
}

function contactRows() {
  return selectedEntityIndexes("contact").map((index) => {
    const [firstName, lastName] = SYNTHETIC_CONTACT_NAMES[index];
    const id = fixtureId("60000000", index + 1);

    return {
      id,
      firstName,
      lastName,
      avatarUrl: `/demo/contact-${index + 1}.svg`,
      notes: null,
      createdAt: new Date(`2026-03-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`),
      updatedAt: new Date(`2026-03-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`),
      identifiers: [
        {
          id: fixtureId("b0000000", index + 1),
          provider: "mail" as const,
          value: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
          messagingId: null,
          displayName: `${firstName} ${lastName}`,
          profileUrl: null,
        },
      ],
      organizations: [],
      users: [{ user: USER_REFERENCE }],
      deals: [],
      tasks: [],
      customFieldValues: [],
    };
  });
}

function dealRows() {
  return selectedEntityIndexes("deal").map((index) => ({
    id: fixtureId("80000000", index + 1),
    name: SYNTHETIC_DEAL_NAMES[index],
    totalValue: 15_000 + index * 2_500,
    totalQuantity: 2 + index,
    notes: null,
    createdAt: new Date(`2026-03-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`),
    updatedAt: new Date(`2026-03-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`),
    organizations: [],
    users: [{ user: USER_REFERENCE }],
    contacts: [],
    services: [],
    tasks: [],
    customFieldValues: [],
  }));
}

function organizationRows() {
  return selectedEntityIndexes("organization").map((index) => ({
    id: fixtureId("70000000", index + 1),
    name: SYNTHETIC_ORGANIZATION_NAMES[index],
    notes: null,
    createdAt: new Date(`2026-03-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`),
    updatedAt: new Date(`2026-03-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`),
    contacts: [],
    users: [{ user: USER_REFERENCE }],
    deals: [],
    tasks: [],
    customFieldValues: [],
  }));
}

function context() {
  const webhookUpsert = vi.fn().mockResolvedValue(undefined);
  const webhookDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const deliveryUpsert = vi.fn().mockResolvedValue(undefined);
  const deliveryDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const contactFindMany = vi.fn().mockResolvedValue(contactRows());
  const dealFindMany = vi.fn().mockResolvedValue(dealRows());
  const organizationFindMany = vi.fn().mockResolvedValue(organizationRows());

  return {
    calls: {
      contactFindMany,
      dealFindMany,
      deliveryDeleteMany,
      deliveryUpsert,
      organizationFindMany,
      webhookDeleteMany,
      webhookUpsert,
    },
    seedContext: {
      ids: SEED_IDS,
      prisma: {
        contact: { findMany: contactFindMany },
        deal: { findMany: dealFindMany },
        organization: { findMany: organizationFindMany },
        webhook: { deleteMany: webhookDeleteMany, upsert: webhookUpsert },
        webhookDelivery: {
          deleteMany: deliveryDeleteMany,
          upsert: deliveryUpsert,
        },
      } as unknown as PrismaClient,
      seedUserEmail: SYNTHETIC_SEED_USER.email,
      sharedUserPassword: "test-password",
    } satisfies SeedContext,
  };
}

function reviveDtoDates(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => reviveDtoDates(item));
  if (value === null || typeof value !== "object") {
    if ((key === "createdAt" || key === "updatedAt") && typeof value === "string") return new Date(value);
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, reviveDtoDates(child, childKey)]),
  );
}

describe("synthetic webhook fixtures", () => {
  it("restores the disabled legacy demo webhook without a credential or live endpoint", async () => {
    const { calls, seedContext } = context();

    await seedWebhooks(seedContext);

    const webhook = calls.webhookUpsert.mock.calls[0][0].create;
    expect(webhook).toMatchObject({
      description: "Webhook for demo",
      enabled: false,
      secret: null,
      url: SYNTHETIC_WEBHOOK_URL,
    });
    expect(new URL(webhook.url).hostname).toBe("receiver.example");
    expect(new Set(webhook.events)).toEqual(new Set(SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.map(({ event }) => event)));
    expect(webhook.createdAt).toEqual(SYNTHETIC_SEED_TIMELINE.webhook.createdAt);
    expect(webhook.updatedAt).toEqual(SYNTHETIC_SEED_TIMELINE.webhook.updatedAt);
    expect(calls.webhookDeleteMany).toHaveBeenCalledOnce();
    expect(calls.webhookDeleteMany).toHaveBeenCalledWith({
      where: {
        companyId: SEED_IDS.company,
        id: {
          startsWith: "22000000-",
          notIn: [fixtureId("22000000", 1)],
        },
      },
    });
  });

  it("restores 14 sanitized delivery examples with full payloads that satisfy their OpenAPI schemas", async () => {
    const { calls, seedContext } = context();

    await seedWebhooks(seedContext);

    expect(calls.deliveryUpsert).toHaveBeenCalledTimes(14);
    expect(SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS).toHaveLength(14);
    expect(SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.filter(({ status }) => status === "success")).toHaveLength(9);
    expect(SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.filter(({ status }) => status === "failed")).toHaveLength(3);
    expect(SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.filter(({ status }) => status === "processing")).toHaveLength(2);

    for (const [{ create }] of calls.deliveryUpsert.mock.calls) {
      expect(create.url).toBe(SYNTHETIC_WEBHOOK_URL);
      expect(create.requestBody).toMatchObject({ event: create.event });
      expect(create.requestBody.data).toMatchObject({
        companyId: SEED_IDS.company,
        entityId: expect.any(String),
        userId: SEED_IDS.user,
      });
      expect(() =>
        DELIVERY_SCHEMAS[create.event as keyof typeof DELIVERY_SCHEMAS].parse(reviveDtoDates(create.requestBody)),
      ).not.toThrow();
      expect(JSON.stringify(create.requestBody)).not.toMatch(/secret|token|api[_-]?key/i);
    }

    expect(calls.deliveryDeleteMany).toHaveBeenCalledOnce();
  });

  it("uses a fixed timeline and produces the same upsert data on every run", async () => {
    const { calls, seedContext } = context();

    await seedWebhooks(seedContext);
    const firstRun = calls.deliveryUpsert.mock.calls.map(([{ create }]) => create);

    calls.deliveryUpsert.mockClear();
    await seedWebhooks(seedContext);
    const secondRun = calls.deliveryUpsert.mock.calls.map(([{ create }]) => create);

    expect(secondRun).toEqual(firstRun);
    expect(firstRun.every(({ createdAt }) => createdAt instanceof Date)).toBe(true);
    expect(firstRun.map(({ createdAt }) => createdAt)).toEqual(
      SYNTHETIC_WEBHOOK_DELIVERY_DEFINITIONS.map((_, index) => SYNTHETIC_SEED_TIMELINE.webhookDelivery(index)),
    );
    expect(firstRun[0].createdAt.getTime()).toBeGreaterThan(SYNTHETIC_SEED_TIMELINE.webhook.createdAt.getTime());
    expect(firstRun.at(-1)?.createdAt.getTime()).toBeLessThan(SYNTHETIC_SEED_TIMELINE.webhook.updatedAt.getTime());
  });
});
