import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, EntityType, Resource } from "@/generated/prisma";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";

const { calls, prisma } = vi.hoisted(() => {
  const calls: Record<string, unknown[]> = {
    contact: [],
    contactOrganization: [],
    dealContact: [],
    taskContact: [],
  };
  const model = (name: keyof typeof calls) => ({
    findMany: vi.fn((args: unknown) => {
      calls[name].push(args);
      return Promise.resolve([]);
    }),
  });

  return {
    calls,
    prisma: {
      contact: model("contact"),
      contactOrganization: model("contactOrganization"),
      dealContact: model("dealContact"),
      taskContact: model("taskContact"),
    },
  };
});

vi.mock("@/prisma/db", () => ({ prisma }));

import { PrismaContactRepo } from "../prisma-contact.repository";

const reader = createMockUserWithPermissions([
  { resource: Resource.contacts, action: Action.readOwn },
  { resource: Resource.organizations, action: Action.readOwn },
  { resource: Resource.deals, action: Action.readOwn },
  { resource: Resource.services, action: Action.readOwn },
  { resource: Resource.tasks, action: Action.readOwn },
]);

describe("activity contact scope readOwn access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(calls).forEach((entries) => entries.splice(0));
  });

  it("applies ownership predicates to every whole-type contact resolution", async () => {
    await runWithTenant(reader, async () => {
      const repo = new PrismaContactRepo();
      for (const entityType of Object.values(EntityType))
        await repo.resolveContactIdsForEntityTypeCompanyWide({ entityType });
    });

    expect(calls.contact[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          users: { some: { userId: reader.id } },
        }),
      }),
    );
    expect(calls.contactOrganization[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          organization: expect.objectContaining({
            users: { some: { userId: reader.id } },
          }),
        }),
      }),
    );
    expect(calls.dealContact[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          deal: expect.objectContaining({
            users: { some: { userId: reader.id } },
          }),
        }),
      }),
    );
    expect(calls.dealContact[1]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          deal: expect.objectContaining({
            services: {
              some: {
                service: expect.objectContaining({
                  users: { some: { userId: reader.id } },
                }),
              },
            },
          }),
        }),
      }),
    );
    expect(calls.taskContact[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          task: expect.objectContaining({
            users: { some: { userId: reader.id } },
          }),
        }),
      }),
    );
  });
});
